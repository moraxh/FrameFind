import {
	angleDelta,
	DEFAULT_POSE_ALPHA,
	type HeadPoseResult,
	OneEuroFilter,
	type OneEuroOptions,
} from "@framefind/utils";

export type HeadPoseSmoothing =
	| { type: "ema"; alpha?: number }
	| { type: "oneEuro"; options?: OneEuroOptions }
	| { type: "none" };

export type HeadPoseDetectorNodeOptions = {
	alpha?: number;
	smoothing?: HeadPoseSmoothing;
};

interface FaceLandmarksDetector {
	estimateFaces(
		input: unknown,
		config?: { flipHorizontal?: boolean },
	): Promise<
		Array<{
			keypoints: Array<{ x: number; y: number; z?: number; name?: string }>;
			box: { xMin: number; yMin: number; xMax: number; yMax: number };
		}>
	>;
}

// Canonical MediaPipe 468-landmark indices used for head pose PnP
const NOSE_TIP = 1;
const CHIN = 152;
const LEFT_EYE_OUTER = 263;
const RIGHT_EYE_OUTER = 33;
const LEFT_MOUTH = 287;
const RIGHT_MOUTH = 57;
const FOREHEAD = 10;

// Approximate 3D face model points (cm) matching the canonical 6-point PnP set
const MODEL_POINTS_3D = [
	[0.0, 0.0, 0.0], // nose tip
	[0.0, -6.3, -1.6], // chin
	[-4.5, 2.5, -3.5], // left eye outer
	[4.5, 2.5, -3.5], // right eye outer
	[-2.8, -4.2, -3.0], // left mouth corner
	[2.8, -4.2, -3.0], // right mouth corner
];

const LANDMARK_INDICES = [
	NOSE_TIP,
	CHIN,
	LEFT_EYE_OUTER,
	RIGHT_EYE_OUTER,
	LEFT_MOUTH,
	RIGHT_MOUTH,
];

function landmarkToImagePoint(
	lm: { x: number; y: number },
	width: number,
	height: number,
): [number, number] {
	return [lm.x * width, lm.y * height];
}

// Simplified head pose from landmarks using geometry (no OpenCV solvePnP in Node).
// Uses forehead-chin axis for pitch, left-right eye axis for yaw/roll.
function estimateHeadPose(
	landmarks: Array<{ x: number; y: number; z?: number }>,
	width: number,
	height: number,
): { yaw: number; pitch: number; roll: number } {
	const get = (i: number) => landmarks[i];

	const noseTip = get(NOSE_TIP);
	const chin = get(CHIN);
	const leftEye = get(LEFT_EYE_OUTER);
	const rightEye = get(RIGHT_EYE_OUTER);
	const forehead = get(FOREHEAD);

	if (!noseTip || !chin || !leftEye || !rightEye || !forehead) {
		return { yaw: 0, pitch: 0, roll: 0 };
	}

	// Roll: angle of eye axis relative to horizontal
	const eyeDx = (rightEye.x - leftEye.x) * width;
	const eyeDy = (rightEye.y - leftEye.y) * height;
	const roll = Math.atan2(eyeDy, eyeDx) * (180 / Math.PI);

	// Yaw: horizontal nose offset relative to eye midpoint
	const eyeMidX = (leftEye.x + rightEye.x) / 2;
	const eyeSpanX = Math.abs(rightEye.x - leftEye.x);
	const noseOffsetX = noseTip.x - eyeMidX;
	const yaw = eyeSpanX > 0 ? (noseOffsetX / eyeSpanX) * 90 : 0;

	// Pitch: vertical nose offset relative to forehead-chin axis midpoint
	const faceMidY = (forehead.y + chin.y) / 2;
	const faceSpanY = Math.abs(chin.y - forehead.y);
	const noseOffsetY = noseTip.y - faceMidY;
	const pitch = faceSpanY > 0 ? (noseOffsetY / faceSpanY) * 90 : 0;

	return { yaw, pitch, roll };
}

export class HeadPoseDetectorNode {
	private landmarksDetector: FaceLandmarksDetector | null = null;
	private alpha: number;
	private smoothingMode: "ema" | "oneEuro" | "none";
	private smoothYaw = 0;
	private smoothPitch = 0;
	private smoothRoll = 0;
	private hasSeenFrame = false;
	private yawFilter: OneEuroFilter;
	private pitchFilter: OneEuroFilter;
	private rollFilter: OneEuroFilter;
	private lastResult: HeadPoseResult = {
		yaw: 0,
		pitch: 0,
		roll: 0,
		faceDetected: false,
	};

	constructor(opts: HeadPoseDetectorNodeOptions = {}) {
		this.alpha = opts.alpha ?? DEFAULT_POSE_ALPHA;
		const smoothing = opts.smoothing ?? { type: "oneEuro" };
		this.smoothingMode = smoothing.type;
		const oneEuroOpts =
			smoothing.type === "oneEuro" ? smoothing.options : undefined;
		this.yawFilter = new OneEuroFilter(oneEuroOpts, true);
		this.pitchFilter = new OneEuroFilter(oneEuroOpts, true);
		this.rollFilter = new OneEuroFilter(oneEuroOpts, true);
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
					refineLandmarks: false,
					maxFaces: 1,
				},
			);
		} catch {
			throw new Error(
				"HeadPoseDetectorNode requires '@tensorflow/tfjs-node' and '@tensorflow-models/face-landmarks-detection'. Install them: npm i @tensorflow/tfjs-node @tensorflow-models/face-landmarks-detection",
			);
		}
	}

	/**
	 * Detect head pose from a raw image file path.
	 * Requires `sharp` installed: npm i sharp
	 */
	async detectFromImagePath(imagePath: string): Promise<HeadPoseResult> {
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

		if (!faces.length || !faces[0].keypoints?.length) {
			this.lastResult = { ...this.lastResult, faceDetected: false };
			return this.lastResult;
		}

		const landmarks = faces[0].keypoints;
		const { yaw, pitch, roll } = estimateHeadPose(landmarks, width, height);

		const tSec = Date.now() / 1000;
		this.lastResult = {
			...this.smooth(yaw, pitch, roll, tSec),
			faceDetected: true,
			landmarks: landmarks.map((lm) => ({ x: lm.x, y: lm.y, z: lm.z ?? 0 })),
		};
		return this.lastResult;
	}

	/**
	 * Detect head pose from a pre-decoded RGBA pixel buffer.
	 * pixels: Uint8Array or Uint8ClampedArray of RGBA pixels (width × height × 4).
	 */
	async detectFromRgbaBuffer(
		pixels: Uint8ClampedArray | Uint8Array,
		width: number,
		height: number,
	): Promise<HeadPoseResult> {
		if (!this.landmarksDetector) throw new Error("Call load() first");

		const tf = await import("@tensorflow/tfjs-node" as string);
		const rgb = rgbaToRgb(pixels, width, height);
		const imageTensor = tf.tensor3d(rgb, [height, width, 3]);

		const faces = await this.landmarksDetector.estimateFaces(imageTensor, {
			flipHorizontal: false,
		});
		imageTensor.dispose();

		if (!faces.length || !faces[0].keypoints?.length) {
			this.lastResult = { ...this.lastResult, faceDetected: false };
			return this.lastResult;
		}

		const landmarks = faces[0].keypoints;
		const { yaw, pitch, roll } = estimateHeadPose(landmarks, width, height);

		const tSec = Date.now() / 1000;
		this.lastResult = {
			...this.smooth(yaw, pitch, roll, tSec),
			faceDetected: true,
			landmarks: landmarks.map((lm) => ({ x: lm.x, y: lm.y, z: lm.z ?? 0 })),
		};
		return this.lastResult;
	}

	private smooth(
		yaw: number,
		pitch: number,
		roll: number,
		tSec: number,
	): { yaw: number; pitch: number; roll: number } {
		if (this.smoothingMode === "none" || !this.hasSeenFrame) {
			this.smoothYaw = yaw;
			this.smoothPitch = pitch;
			this.smoothRoll = roll;
			this.hasSeenFrame = true;
			if (this.smoothingMode === "oneEuro") {
				return {
					yaw: this.yawFilter.filter(yaw, tSec),
					pitch: this.pitchFilter.filter(pitch, tSec),
					roll: this.rollFilter.filter(roll, tSec),
				};
			}
			return { yaw, pitch, roll };
		}

		if (this.smoothingMode === "oneEuro") {
			return {
				yaw: this.yawFilter.filter(yaw, tSec),
				pitch: this.pitchFilter.filter(pitch, tSec),
				roll: this.rollFilter.filter(roll, tSec),
			};
		}

		this.smoothYaw += this.alpha * angleDelta(yaw, this.smoothYaw);
		this.smoothPitch += this.alpha * angleDelta(pitch, this.smoothPitch);
		this.smoothRoll += this.alpha * angleDelta(roll, this.smoothRoll);
		return {
			yaw: this.smoothYaw,
			pitch: this.smoothPitch,
			roll: this.smoothRoll,
		};
	}

	resetSmoothing(): void {
		this.smoothYaw = 0;
		this.smoothPitch = 0;
		this.smoothRoll = 0;
		this.hasSeenFrame = false;
		this.yawFilter.reset();
		this.pitchFilter.reset();
		this.rollFilter.reset();
		this.lastResult = { yaw: 0, pitch: 0, roll: 0, faceDetected: false };
	}

	dispose(): void {
		this.landmarksDetector = null;
		this.resetSmoothing();
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
