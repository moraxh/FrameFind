export type BlinkDetectorNodeOptions = {
	minFaceDetectionConfidence?: number;
	minFacePresenceConfidence?: number;
	minTrackingConfidence?: number;
};

export type BlinkResult = {
	blinkDetected: boolean;
	ear: number | null;
	leftEar: number | null;
	rightEar: number | null;
	leftBlinking: boolean;
	rightBlinking: boolean;
	faceDetected: boolean;
	calibrated: boolean;
};

interface FaceLandmarksDetector {
	estimateFaces(
		input: unknown,
		config?: { flipHorizontal?: boolean },
	): Promise<
		Array<{
			keypoints: Array<{ x: number; y: number; z?: number; name?: string }>;
		}>
	>;
}

const EAR_SMOOTH_TAU_MS = 70;
const EAR_BASELINE_TAU_MS = 3000;
const EAR_ENTER_RATIO = 0.65;
const EAR_EXIT_RATIO = 0.75;
const EAR_MIN_LOW_FRAMES = 2;
const EAR_MIN_DROP = 0.02;
const BASELINE_WARMUP_FRAMES = 15;
const EAR_ASYMMETRY_RATIO = 0.45;

const LEFT_EYE = [362, 385, 387, 263, 373, 380];
const RIGHT_EYE = [33, 160, 158, 133, 153, 144];

type Point2D = { x: number; y: number };

function dist(a: Point2D, b: Point2D): number {
	return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function eyeAspectRatio(
	landmarks: Point2D[],
	eyeIndices: number[],
): number | null {
	const [p1, p2, p3, p4, p5, p6] = eyeIndices.map((i) => landmarks[i]);
	const vertical1 = dist(p2, p6);
	const vertical2 = dist(p3, p5);
	const horizontal = dist(p1, p4);
	if (horizontal < 1e-6 || !Number.isFinite(horizontal)) return null;
	const ear = (vertical1 + vertical2) / (2 * horizontal);
	return Number.isFinite(ear) ? ear : null;
}

interface EyeState {
	baseline: number | null;
	baselineSamples: number[];
	warmupFrames: number;
	smoothed: number | null;
	prevSmoothed: number | null;
	lowFrames: number;
}

function newEyeState(): EyeState {
	return {
		baseline: null,
		baselineSamples: [],
		warmupFrames: 0,
		smoothed: null,
		prevSmoothed: null,
		lowFrames: 0,
	};
}

export class BlinkDetectorNode {
	private landmarksDetector: FaceLandmarksDetector | null = null;
	private opts: Required<BlinkDetectorNodeOptions>;
	private blinking = false;
	private leftEye: EyeState = newEyeState();
	private rightEye: EyeState = newEyeState();
	private lastResult: BlinkResult = {
		blinkDetected: false,
		ear: null,
		leftEar: null,
		rightEar: null,
		leftBlinking: false,
		rightBlinking: false,
		faceDetected: false,
		calibrated: false,
	};

	constructor(opts: BlinkDetectorNodeOptions = {}) {
		this.opts = {
			minFaceDetectionConfidence: opts.minFaceDetectionConfidence ?? 0.5,
			minFacePresenceConfidence: opts.minFacePresenceConfidence ?? 0.5,
			minTrackingConfidence: opts.minTrackingConfidence ?? 0.5,
		};
	}

	async load(): Promise<void> {
		try {
			const tf = await import("@tensorflow/tfjs-node" as string);
			const faceLandmarksDetection = await import(
				"@tensorflow-models/face-landmarks-detection" as string
			);
			await tf.ready();
			this.landmarksDetector = await faceLandmarksDetection.createDetector(
				faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
				{
					runtime: "tfjs",
					refineLandmarks: true,
					maxFaces: 1,
				},
			);
		} catch {
			throw new Error(
				"BlinkDetectorNode requires '@tensorflow/tfjs-node' and '@tensorflow-models/face-landmarks-detection'. Install them: npm i @tensorflow/tfjs-node @tensorflow-models/face-landmarks-detection",
			);
		}
	}

	/**
	 * Detect blink from a raw image file path.
	 * Requires `sharp` installed: npm i sharp
	 * Designed for video-frame pipelines: call once per frame in sequence.
	 */
	async detectFromImagePath(imagePath: string): Promise<BlinkResult> {
		if (!this.landmarksDetector) throw new Error("Call load() first");

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let sharp: any;
		try {
			sharp = (await import("sharp" as string)).default;
		} catch {
			throw new Error(
				"Install 'sharp' to use detectFromImagePath: npm i sharp",
			);
		}

		const tf = await import("@tensorflow/tfjs-node" as string);
		const meta = await sharp(imagePath).metadata();
		const width: number = meta.width ?? 0;
		const height: number = meta.height ?? 0;

		const { data } = await sharp(imagePath)
			.toFormat("raw")
			.toBuffer({ resolveWithObject: true });
		const imageTensor = tf.tensor3d(
			new Uint8Array(data.buffer as ArrayBuffer),
			[height, width, 3],
		);

		const faces = await this.landmarksDetector.estimateFaces(imageTensor, {
			flipHorizontal: false,
		});
		imageTensor.dispose();

		return this.processLandmarks(faces.length ? faces[0].keypoints : null);
	}

	/**
	 * Detect blink from a pre-decoded RGBA pixel buffer.
	 * pixels: Uint8Array or Uint8ClampedArray of RGBA pixels (width × height × 4).
	 * Designed for video-frame pipelines: call once per frame in sequence.
	 */
	async detectFromRgbaBuffer(
		pixels: Uint8ClampedArray | Uint8Array,
		width: number,
		height: number,
	): Promise<BlinkResult> {
		if (!this.landmarksDetector) throw new Error("Call load() first");

		const tf = await import("@tensorflow/tfjs-node" as string);
		const rgb = rgbaToRgb(pixels, width, height);
		const imageTensor = tf.tensor3d(rgb, [height, width, 3]);

		const faces = await this.landmarksDetector.estimateFaces(imageTensor, {
			flipHorizontal: false,
		});
		imageTensor.dispose();

		return this.processLandmarks(faces.length ? faces[0].keypoints : null);
	}

	private processLandmarks(
		landmarks: Array<{ x: number; y: number; z?: number }> | null,
	): BlinkResult {
		if (!landmarks) {
			this.lastResult = {
				...this.lastResult,
				blinkDetected: false,
				faceDetected: false,
			};
			return this.lastResult;
		}

		const leftEAR = eyeAspectRatio(landmarks as Point2D[], LEFT_EYE);
		const rightEAR = eyeAspectRatio(landmarks as Point2D[], RIGHT_EYE);

		if (leftEAR === null || rightEAR === null) {
			this.lastResult = {
				...this.lastResult,
				blinkDetected: false,
				faceDetected: true,
			};
			return this.lastResult;
		}

		this.updateEyeSmooth(this.leftEye, leftEAR);
		this.updateEyeSmooth(this.rightEye, rightEAR);

		const leftSmoothed = this.leftEye.smoothed ?? leftEAR;
		const rightSmoothed = this.rightEye.smoothed ?? rightEAR;
		const avgEar = (leftSmoothed + rightSmoothed) / 2;

		const leftBlinking = this.isEyeBlinking(this.leftEye);
		const rightBlinking = this.isEyeBlinking(this.rightEye);

		const makeResult = (blinkDetected: boolean): BlinkResult => ({
			blinkDetected,
			ear: avgEar,
			leftEar: this.leftEye.smoothed,
			rightEar: this.rightEye.smoothed,
			leftBlinking,
			rightBlinking,
			faceDetected: true,
			calibrated: this.calibrated,
		});

		if (!this.calibrated) {
			this.lastResult = makeResult(false);
			return this.lastResult;
		}

		// Asymmetry wink fast-path
		const maxEAR = Math.max(leftEAR, rightEAR);
		const minEAR = Math.min(leftEAR, rightEAR);
		if (maxEAR > 0 && minEAR / maxEAR < EAR_ASYMMETRY_RATIO) {
			if (!this.blinking) {
				const eye = leftEAR < rightEAR ? this.leftEye : this.rightEye;
				eye.lowFrames += 1;
				if (eye.lowFrames >= EAR_MIN_LOW_FRAMES) {
					this.blinking = true;
					this.lastResult = makeResult(true);
					return this.lastResult;
				}
			}
			this.lastResult = makeResult(false);
			return this.lastResult;
		}

		if (!this.blinking) {
			const leftFire = this.eyeBlinkEntry(this.leftEye);
			const rightFire = this.eyeBlinkEntry(this.rightEye);
			if (leftFire || rightFire) {
				this.blinking = true;
				this.lastResult = makeResult(true);
				return this.lastResult;
			}
		} else if (this.bothEyesOpen()) {
			this.blinking = false;
			this.leftEye.lowFrames = 0;
			this.rightEye.lowFrames = 0;
			this.leftEye.prevSmoothed = null;
			this.rightEye.prevSmoothed = null;
		}

		this.lastResult = makeResult(false);
		return this.lastResult;
	}

	private updateEyeSmooth(eye: EyeState, raw: number): void {
		eye.prevSmoothed = eye.smoothed;
		const a = 1 - Math.exp(-33 / EAR_SMOOTH_TAU_MS); // assume ~30fps
		eye.smoothed =
			eye.smoothed === null ? raw : eye.smoothed * (1 - a) + raw * a;

		if (eye.baseline === null) {
			eye.warmupFrames += 1;
			eye.baselineSamples.push(raw);
			if (eye.warmupFrames >= BASELINE_WARMUP_FRAMES) {
				const sorted = [...eye.baselineSamples].sort((a, b) => a - b);
				eye.baseline = sorted[Math.floor(sorted.length / 2)];
				eye.baselineSamples = [];
			}
		} else if (
			!this.blinking &&
			eye.smoothed !== null &&
			eye.smoothed >= eye.baseline
		) {
			const ba = 1 - Math.exp(-33 / EAR_BASELINE_TAU_MS);
			eye.baseline = eye.baseline * (1 - ba) + eye.smoothed * ba;
		}
	}

	private eyeBlinkEntry(eye: EyeState): boolean {
		if (eye.baseline === null || eye.smoothed === null) return false;
		const enter = eye.baseline * EAR_ENTER_RATIO;
		if (eye.smoothed >= enter) {
			eye.lowFrames = 0;
			return false;
		}
		const drop =
			eye.prevSmoothed !== null ? eye.prevSmoothed - eye.smoothed : 0;
		const fastEnough = drop >= EAR_MIN_DROP || eye.lowFrames > 0;
		if (!fastEnough) {
			eye.lowFrames = 0;
			return false;
		}
		eye.lowFrames += 1;
		return eye.lowFrames >= EAR_MIN_LOW_FRAMES;
	}

	private bothEyesOpen(): boolean {
		const l = this.leftEye;
		const r = this.rightEye;
		if (l.baseline === null || l.smoothed === null) return true;
		if (r.baseline === null || r.smoothed === null) return true;
		return (
			l.smoothed >= l.baseline * EAR_EXIT_RATIO &&
			r.smoothed >= r.baseline * EAR_EXIT_RATIO
		);
	}

	private isEyeBlinking(eye: EyeState): boolean {
		if (eye.baseline === null || eye.smoothed === null) return false;
		return eye.smoothed < eye.baseline * EAR_ENTER_RATIO;
	}

	get calibrated(): boolean {
		return this.leftEye.baseline !== null && this.rightEye.baseline !== null;
	}

	resetHistory(): void {
		this.blinking = false;
		this.leftEye = newEyeState();
		this.rightEye = newEyeState();
		this.lastResult = {
			blinkDetected: false,
			ear: null,
			leftEar: null,
			rightEar: null,
			leftBlinking: false,
			rightBlinking: false,
			faceDetected: false,
			calibrated: false,
		};
	}

	dispose(): void {
		this.landmarksDetector = null;
		this.resetHistory();
	}
}

function rgbaToRgb(
	pixels: Uint8ClampedArray | Uint8Array,
	width: number,
	height: number,
): Uint8Array {
	const n = width * height;
	const rgb = new Uint8Array(n * 3);
	for (let i = 0; i < n; i++) {
		rgb[i * 3] = pixels[i * 4];
		rgb[i * 3 + 1] = pixels[i * 4 + 1];
		rgb[i * 3 + 2] = pixels[i * 4 + 2];
	}
	return rgb;
}
