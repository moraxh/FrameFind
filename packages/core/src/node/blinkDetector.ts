export type BlinkDetectorNodeOptions = {
	minFaceDetectionConfidence?: number;
	minFacePresenceConfidence?: number;
	minTrackingConfidence?: number;
	/** Assumed input frame rate. Used to convert ms thresholds → frames. */
	fps?: number;
};

export type BlinkEventType = "blink" | "wink-left" | "wink-right";

export type BlinkResult = {
	event: BlinkEventType | null;
	blinkDetected: boolean;
	leftClosed: boolean;
	rightClosed: boolean;
	leftScore: number;
	rightScore: number;
	ear: number | null;
	leftEar: number | null;
	rightEar: number | null;
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

const EAR_ENTER_RATIO = 0.65;
const EAR_EXIT_RATIO = 0.78;
const BASELINE_WARMUP_MS = 600;
const BASELINE_TAU_OPEN_MS = 8000;
const BASELINE_TAU_DROP_MS = 30000;
const EAR_SMOOTH_TAU_MS_FAST = 10;
const EAR_SMOOTH_TAU_MS_SLOW = 60;

const CLOSE_SCORE_ENTER = 0.55;
const CLOSE_SCORE_EXIT = 0.35;
const MIN_CLOSING_MS = 35;
const MIN_OPENING_MS = 35;

const BLINK_PAIR_WINDOW_MS = 90;
const WINK_MIN_DURATION_MS = 90;
const WINK_MAX_DURATION_MS = 1200;
const BLINK_MIN_DURATION_MS = 50;
const BLINK_MAX_DURATION_MS = 600;

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

type EyePhase = "open" | "closing" | "closed" | "opening";

interface EyeState {
	baseline: number | null;
	baselineSamples: number[];
	warmupMs: number;
	smoothed: number | null;
	prevSmoothed: number | null;
	velocity: number;
	closeScore: number;
	phase: EyePhase;
	phaseEnteredAtMs: number;
	closedAtMs: number | null;
	openedAtMs: number | null;
	pendingClassify: boolean;
}

function newEyeState(): EyeState {
	return {
		baseline: null,
		baselineSamples: [],
		warmupMs: 0,
		smoothed: null,
		prevSmoothed: null,
		velocity: 0,
		closeScore: 0,
		phase: "open",
		phaseEnteredAtMs: 0,
		closedAtMs: null,
		openedAtMs: null,
		pendingClassify: false,
	};
}

export class BlinkDetectorNode {
	private landmarksDetector: FaceLandmarksDetector | null = null;
	private opts: Required<BlinkDetectorNodeOptions>;
	private leftEye: EyeState = newEyeState();
	private rightEye: EyeState = newEyeState();
	private elapsedMs = 0;
	private dt_ms: number;
	private lastResult: BlinkResult = emptyResult();

	constructor(opts: BlinkDetectorNodeOptions = {}) {
		this.opts = {
			minFaceDetectionConfidence: opts.minFaceDetectionConfidence ?? 0.5,
			minFacePresenceConfidence: opts.minFacePresenceConfidence ?? 0.5,
			minTrackingConfidence: opts.minTrackingConfidence ?? 0.5,
			fps: opts.fps ?? 30,
		};
		this.dt_ms = 1000 / this.opts.fps;
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
		this.elapsedMs += this.dt_ms;
		const now = this.elapsedMs;

		if (!landmarks) {
			this.lastResult = {
				...emptyResult(),
				calibrated: this.calibrated,
				ear: this.smoothedEar,
				leftEar: this.leftEye.smoothed,
				rightEar: this.rightEye.smoothed,
				faceDetected: false,
			};
			return this.lastResult;
		}

		const leftEAR = eyeAspectRatio(landmarks as Point2D[], LEFT_EYE);
		const rightEAR = eyeAspectRatio(landmarks as Point2D[], RIGHT_EYE);

		if (leftEAR !== null)
			this.updateSmooth(this.leftEye, leftEAR, this.dt_ms, now);
		if (rightEAR !== null)
			this.updateSmooth(this.rightEye, rightEAR, this.dt_ms, now);

		this.leftEye.closeScore = this.computeCloseScore(this.leftEye);
		this.rightEye.closeScore = this.computeCloseScore(this.rightEye);

		this.transitionEye(this.leftEye, now);
		this.transitionEye(this.rightEye, now);

		const event = this.calibrated ? this.classifyEvent(now) : null;

		this.lastResult = {
			event,
			blinkDetected: event !== null,
			leftClosed:
				this.leftEye.phase === "closed" || this.leftEye.phase === "opening",
			rightClosed:
				this.rightEye.phase === "closed" || this.rightEye.phase === "opening",
			leftScore: this.leftEye.closeScore,
			rightScore: this.rightEye.closeScore,
			ear: this.smoothedEar,
			leftEar: this.leftEye.smoothed,
			rightEar: this.rightEye.smoothed,
			faceDetected: true,
			calibrated: this.calibrated,
		};
		return this.lastResult;
	}

	private updateSmooth(eye: EyeState, raw: number, dt_ms: number, now: number) {
		eye.prevSmoothed = eye.smoothed;
		const closing = eye.smoothed !== null && raw < eye.smoothed;
		const tau = closing ? EAR_SMOOTH_TAU_MS_FAST : EAR_SMOOTH_TAU_MS_SLOW;
		const a = 1 - Math.exp(-dt_ms / tau);
		const prev = eye.smoothed;
		eye.smoothed =
			eye.smoothed === null ? raw : eye.smoothed * (1 - a) + raw * a;
		eye.velocity = prev !== null ? (prev - eye.smoothed) / dt_ms : 0;

		if (eye.baseline === null) {
			eye.warmupMs += dt_ms;
			eye.baselineSamples.push(raw);
			if (eye.warmupMs >= BASELINE_WARMUP_MS && eye.baselineSamples.length > 0) {
				const sorted = [...eye.baselineSamples].sort((a, b) => a - b);
				eye.baseline = sorted[Math.floor(sorted.length * 0.6)];
				eye.baselineSamples = [];
			}
			return;
		}

		if (eye.phase === "open" && eye.smoothed !== null) {
			const tau =
				eye.smoothed >= eye.baseline
					? BASELINE_TAU_OPEN_MS
					: BASELINE_TAU_DROP_MS;
			const ba = 1 - Math.exp(-dt_ms / tau);
			eye.baseline = eye.baseline * (1 - ba) + eye.smoothed * ba;
		}
	}

	private computeCloseScore(eye: EyeState): number {
		if (eye.baseline === null || eye.smoothed === null) return 0;
		const earNormalized = clamp01(
			(eye.baseline - eye.smoothed) / (eye.baseline * (1 - EAR_ENTER_RATIO)),
		);
		const earPart = clamp01(
			(1 - eye.smoothed / (eye.baseline * EAR_ENTER_RATIO)) * 0.5 + 0.5,
		);
		const velocityBoost = clamp01(eye.velocity * 20);
		return Math.max(earNormalized, earPart) * (1 + 0.2 * velocityBoost);
	}

	private transitionEye(eye: EyeState, now: number) {
		const enter = eye.closeScore >= CLOSE_SCORE_ENTER;
		const exit = eye.closeScore <= CLOSE_SCORE_EXIT;
		const dur = now - eye.phaseEnteredAtMs;

		switch (eye.phase) {
			case "open":
				if (enter) this.setPhase(eye, "closing", now);
				break;
			case "closing":
				if (exit) this.setPhase(eye, "open", now);
				else if (dur >= MIN_CLOSING_MS && enter) {
					this.setPhase(eye, "closed", now);
					eye.closedAtMs = now;
				}
				break;
			case "closed":
				if (exit) this.setPhase(eye, "opening", now);
				break;
			case "opening":
				if (enter) this.setPhase(eye, "closed", now);
				else if (dur >= MIN_OPENING_MS && exit) {
					this.setPhase(eye, "open", now);
					eye.openedAtMs = now;
					eye.pendingClassify = true;
				}
				break;
		}
	}

	private setPhase(eye: EyeState, phase: EyePhase, now: number) {
		eye.phase = phase;
		eye.phaseEnteredAtMs = now;
	}

	private classifyEvent(now: number): BlinkEventType | null {
		const l = this.leftEye;
		const r = this.rightEye;

		if (!l.pendingClassify && !r.pendingClassify) return null;

		if (
			l.pendingClassify &&
			r.pendingClassify &&
			l.closedAtMs !== null &&
			r.closedAtMs !== null &&
			l.openedAtMs !== null &&
			r.openedAtMs !== null
		) {
			const closeGap = Math.abs(l.closedAtMs - r.closedAtMs);
			const openGap = Math.abs(l.openedAtMs - r.openedAtMs);
			const lDur = l.openedAtMs - l.closedAtMs;
			const rDur = r.openedAtMs - r.closedAtMs;
			if (
				closeGap <= BLINK_PAIR_WINDOW_MS &&
				openGap <= BLINK_PAIR_WINDOW_MS &&
				lDur >= BLINK_MIN_DURATION_MS &&
				rDur >= BLINK_MIN_DURATION_MS &&
				lDur <= BLINK_MAX_DURATION_MS &&
				rDur <= BLINK_MAX_DURATION_MS
			) {
				l.pendingClassify = false;
				r.pendingClassify = false;
				return "blink";
			}
		}

		const tryWink = (
			self: EyeState,
			other: EyeState,
			label: "wink-left" | "wink-right",
		): BlinkEventType | null => {
			if (!self.pendingClassify) return null;
			if (self.closedAtMs === null || self.openedAtMs === null) return null;
			const dur = self.openedAtMs - self.closedAtMs;
			if (dur < WINK_MIN_DURATION_MS || dur > WINK_MAX_DURATION_MS)
				return null;
			if (
				other.closedAtMs !== null &&
				other.closedAtMs >= self.closedAtMs - BLINK_PAIR_WINDOW_MS &&
				other.closedAtMs <= self.openedAtMs + BLINK_PAIR_WINDOW_MS
			) {
				return null;
			}
			self.pendingClassify = false;
			return label;
		};

		const leftWink = tryWink(l, r, "wink-left");
		if (leftWink) return leftWink;
		const rightWink = tryWink(r, l, "wink-right");
		if (rightWink) return rightWink;

		const STALE_MS = WINK_MAX_DURATION_MS + BLINK_PAIR_WINDOW_MS;
		if (
			l.pendingClassify &&
			l.openedAtMs !== null &&
			now - l.openedAtMs > STALE_MS
		)
			l.pendingClassify = false;
		if (
			r.pendingClassify &&
			r.openedAtMs !== null &&
			now - r.openedAtMs > STALE_MS
		)
			r.pendingClassify = false;

		return null;
	}

	get calibrated(): boolean {
		return this.leftEye.baseline !== null && this.rightEye.baseline !== null;
	}

	get smoothedEar(): number | null {
		const l = this.leftEye.smoothed;
		const r = this.rightEye.smoothed;
		if (l === null && r === null) return null;
		if (l === null) return r;
		if (r === null) return l;
		return (l + r) / 2;
	}

	resetHistory(): void {
		this.leftEye = newEyeState();
		this.rightEye = newEyeState();
		this.elapsedMs = 0;
		this.lastResult = emptyResult();
	}

	dispose(): void {
		this.landmarksDetector = null;
		this.resetHistory();
	}
}

function clamp01(v: number): number {
	return Math.max(0, Math.min(1, v));
}

function emptyResult(): BlinkResult {
	return {
		event: null,
		blinkDetected: false,
		leftClosed: false,
		rightClosed: false,
		leftScore: 0,
		rightScore: 0,
		ear: null,
		leftEar: null,
		rightEar: null,
		faceDetected: false,
		calibrated: false,
	};
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
