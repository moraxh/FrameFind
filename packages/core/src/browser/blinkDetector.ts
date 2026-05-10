import { type FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

const EAR_SMOOTH_TAU_MS = 70;
const EAR_BASELINE_TAU_MS = 3000;
const EAR_ENTER_RATIO = 0.65;
const EAR_EXIT_RATIO = 0.75;
const EAR_MIN_LOW_MS = 60;
const EAR_MIN_DROP_PER_SEC = 1.2;
const BASELINE_WARMUP_MS = 500;
const MISSING_FACE_MS = 165;
const EAR_ASYMMETRY_RATIO = 0.45;
const BLENDSHAPE_BLINK_ENTER = 0.5;
const BLENDSHAPE_BLINK_EXIT = 0.35;
const BLENDSHAPE_MIN_LOW_MS = 50;

const LEFT_EYE = [362, 385, 387, 263, 373, 380];
const RIGHT_EYE = [33, 160, 158, 133, 153, 144];

const DEFAULT_FACE_LANDMARKER_MODEL =
	"https://cdn.framefind.moraxh.dev/mediapipe/models/face_landmarker/v1/face_landmarker.task";
const DEFAULT_MEDIAPIPE_WASM =
	"https://cdn.framefind.moraxh.dev/mediapipe/tasks-vision/0.10.35/wasm";

export type BlinkDetectorOptions = {
	faceLandmarkerModelUrl?: string;
	mediapipeWasmPath?: string;
	preferGpu?: boolean;
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

function isEyeValid(landmarks: Point2D[], eyeIndices: number[]): boolean {
	return eyeIndices.every((i) => {
		const p = landmarks[i];
		return (
			p !== undefined &&
			Number.isFinite(p.x) &&
			Number.isFinite(p.y) &&
			p.x >= 0 &&
			p.x <= 1 &&
			p.y >= 0 &&
			p.y <= 1
		);
	});
}

interface EyeState {
	baseline: number | null;
	baselineSamples: number[];
	warmupStart: number | null;
	smoothed: number | null;
	prevSmoothed: number | null;
	lowMs: number;
	blendLowMs: number;
}

function newEyeState(): EyeState {
	return {
		baseline: null,
		baselineSamples: [],
		warmupStart: null,
		smoothed: null,
		prevSmoothed: null,
		lowMs: 0,
		blendLowMs: 0,
	};
}

export class BlinkDetector {
	private faceLandmarker: FaceLandmarker | null = null;
	private opts: Required<BlinkDetectorOptions>;
	private blinking = false;
	private leftEye: EyeState = newEyeState();
	private rightEye: EyeState = newEyeState();
	private missingFaceMs = 0;
	private missingEyeMs = 0;
	private lastInferenceTime = 0;
	private lastInferenceTimestamp = 0;
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
	private pendingBlink = false;

	constructor(opts: BlinkDetectorOptions = {}) {
		this.opts = {
			faceLandmarkerModelUrl:
				opts.faceLandmarkerModelUrl ?? DEFAULT_FACE_LANDMARKER_MODEL,
			mediapipeWasmPath: opts.mediapipeWasmPath ?? DEFAULT_MEDIAPIPE_WASM,
			preferGpu: opts.preferGpu ?? true,
			minFaceDetectionConfidence: opts.minFaceDetectionConfidence ?? 0.5,
			minFacePresenceConfidence: opts.minFacePresenceConfidence ?? 0.5,
			minTrackingConfidence: opts.minTrackingConfidence ?? 0.5,
		};
	}

	async load(): Promise<void> {
		const { FaceLandmarker: FL, FilesetResolver: FR } = await import(
			"@mediapipe/tasks-vision"
		);
		const vision = await FR.forVisionTasks(this.opts.mediapipeWasmPath);
		const baseConf = {
			runningMode: "VIDEO" as const,
			numFaces: 1,
			minFaceDetectionConfidence: this.opts.minFaceDetectionConfidence,
			minFacePresenceConfidence: this.opts.minFacePresenceConfidence,
			minTrackingConfidence: this.opts.minTrackingConfidence,
			outputFaceBlendshapes: true,
		};

		if (this.opts.preferGpu) {
			try {
				this.faceLandmarker = await FL.createFromOptions(vision, {
					...baseConf,
					baseOptions: {
						modelAssetPath: this.opts.faceLandmarkerModelUrl,
						delegate: "GPU",
					},
				});
				return;
			} catch {
				// fall through to CPU
			}
		}

		this.faceLandmarker = await FL.createFromOptions(vision, {
			...baseConf,
			baseOptions: {
				modelAssetPath: this.opts.faceLandmarkerModelUrl,
				delegate: "CPU",
			},
		});
	}

	private updateEyeSmooth(
		eye: EyeState,
		raw: number,
		dt_ms: number,
		now: number,
	): void {
		eye.prevSmoothed = eye.smoothed;
		const a = 1 - Math.exp(-dt_ms / EAR_SMOOTH_TAU_MS);
		eye.smoothed =
			eye.smoothed === null ? raw : eye.smoothed * (1 - a) + raw * a;

		if (eye.baseline === null) {
			if (eye.warmupStart === null) eye.warmupStart = now;
			eye.baselineSamples.push(raw);
			if (
				now - eye.warmupStart >= BASELINE_WARMUP_MS &&
				eye.baselineSamples.length > 0
			) {
				const sorted = [...eye.baselineSamples].sort((a, b) => a - b);
				eye.baseline = sorted[Math.floor(sorted.length / 2)];
				eye.baselineSamples = [];
			}
		} else if (!this.blinking && eye.smoothed >= eye.baseline) {
			const ba = 1 - Math.exp(-dt_ms / EAR_BASELINE_TAU_MS);
			eye.baseline = eye.baseline * (1 - ba) + eye.smoothed * ba;
		}
	}

	private eyeBlinkEntry(eye: EyeState, dt_ms: number): boolean {
		if (eye.baseline === null || eye.smoothed === null) return false;
		const enter = eye.baseline * EAR_ENTER_RATIO;
		if (eye.smoothed >= enter) {
			eye.lowMs = 0;
			return false;
		}
		const dropPerSec =
			eye.prevSmoothed !== null
				? ((eye.prevSmoothed - eye.smoothed) / dt_ms) * 1000
				: 0;
		const fastEnough = dropPerSec >= EAR_MIN_DROP_PER_SEC || eye.lowMs > 0;
		if (!fastEnough) {
			eye.lowMs = 0;
			return false;
		}
		eye.lowMs += dt_ms;
		return eye.lowMs >= EAR_MIN_LOW_MS;
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

	detectFromVideo(video: HTMLVideoElement): BlinkResult {
		if (!this.faceLandmarker)
			return { ...this.lastResult, blinkDetected: false };

		if (
			video.readyState < 2 ||
			video.videoWidth === 0 ||
			video.videoHeight === 0
		) {
			return { ...this.lastResult, blinkDetected: false };
		}

		const now = performance.now();
		// Allow up to ~50fps (20ms) — blinks are ~100-150ms so we need dense sampling
		if (now - this.lastInferenceTime < 20)
			return { ...this.lastResult, blinkDetected: false };

		this.lastInferenceTime = now;

		const results = this.faceLandmarker.detectForVideo(video, now);
		this.lastResult = this.processResults(results, now);
		return this.lastResult;
	}

	private get leftBlinking(): boolean {
		const l = this.leftEye;
		if (l.baseline === null || l.smoothed === null) return false;
		return (
			l.smoothed < l.baseline * EAR_ENTER_RATIO ||
			l.blendLowMs >= BLENDSHAPE_MIN_LOW_MS
		);
	}

	private get rightBlinking(): boolean {
		const r = this.rightEye;
		if (r.baseline === null || r.smoothed === null) return false;
		return (
			r.smoothed < r.baseline * EAR_ENTER_RATIO ||
			r.blendLowMs >= BLENDSHAPE_MIN_LOW_MS
		);
	}

	private processResults(
		results: {
			faceLandmarks?: Point2D[][];
			faceBlendshapes?: {
				categories: { categoryName: string; score: number }[];
			}[];
		},
		now: number,
	): BlinkResult {
		const dt_ms =
			this.lastInferenceTimestamp > 0
				? Math.min(now - this.lastInferenceTimestamp, 200)
				: 33;
		this.lastInferenceTimestamp = now;
		this.pendingBlink = false;

		if (!results.faceLandmarks?.length) {
			if (!this.blinking) {
				this.missingFaceMs += dt_ms;
				if (this.missingFaceMs >= MISSING_FACE_MS) {
					this.blinking = true;
					this.pendingBlink = true;
				}
			}
			return {
				blinkDetected: this.pendingBlink,
				ear: null,
				leftEar: null,
				rightEar: null,
				leftBlinking: false,
				rightBlinking: false,
				faceDetected: false,
				calibrated: this.calibrated,
			};
		}

		this.missingFaceMs = 0;
		const lm = results.faceLandmarks[0];

		const leftValid = isEyeValid(lm, LEFT_EYE);
		const rightValid = isEyeValid(lm, RIGHT_EYE);
		const leftEAR = leftValid ? eyeAspectRatio(lm, LEFT_EYE) : null;
		const rightEAR = rightValid ? eyeAspectRatio(lm, RIGHT_EYE) : null;

		if (!leftValid || !rightValid || leftEAR === null || rightEAR === null) {
			if (!this.blinking) {
				this.missingEyeMs += dt_ms;
				if (this.missingEyeMs >= MISSING_FACE_MS) {
					this.blinking = true;
					this.pendingBlink = true;
				}
			}
			return {
				blinkDetected: this.pendingBlink,
				ear: this.smoothedEar,
				leftEar: this.leftEye.smoothed,
				rightEar: this.rightEye.smoothed,
				leftBlinking: this.leftBlinking,
				rightBlinking: this.rightBlinking,
				faceDetected: true,
				calibrated: this.calibrated,
			};
		}

		this.missingEyeMs = 0;

		// Signal 1: blendshapes (primary)
		const cats = results.faceBlendshapes?.[0]?.categories ?? [];
		let blendLeft = 0,
			blendRight = 0;
		for (const c of cats) {
			if (c.categoryName === "eyeBlinkLeft") blendLeft = c.score;
			else if (c.categoryName === "eyeBlinkRight") blendRight = c.score;
		}

		const updateBlend = (eye: EyeState, score: number): boolean => {
			if (score >= BLENDSHAPE_BLINK_ENTER) {
				eye.blendLowMs += dt_ms;
				return eye.blendLowMs >= BLENDSHAPE_MIN_LOW_MS;
			}
			if (score < BLENDSHAPE_BLINK_EXIT) eye.blendLowMs = 0;
			return false;
		};

		const blendLeftFire = updateBlend(this.leftEye, blendLeft);
		const blendRightFire = updateBlend(this.rightEye, blendRight);

		this.updateEyeSmooth(this.leftEye, leftEAR, dt_ms, now);
		this.updateEyeSmooth(this.rightEye, rightEAR, dt_ms, now);

		const leftSmoothed = this.leftEye.smoothed ?? leftEAR;
		const rightSmoothed = this.rightEye.smoothed ?? rightEAR;
		const avgEar = (leftSmoothed + rightSmoothed) / 2;

		const makeResult = (blinkDetected: boolean): BlinkResult => ({
			blinkDetected,
			ear: avgEar,
			leftEar: this.leftEye.smoothed,
			rightEar: this.rightEye.smoothed,
			leftBlinking: this.leftBlinking,
			rightBlinking: this.rightBlinking,
			faceDetected: true,
			calibrated: this.calibrated,
		});

		if (!this.blinking && (blendLeftFire || blendRightFire)) {
			this.blinking = true;
			this.pendingBlink = true;
			return makeResult(true);
		}

		// Signal 2: asymmetry wink fast-path
		const maxEAR = Math.max(leftEAR, rightEAR);
		const minEAR = Math.min(leftEAR, rightEAR);
		if (maxEAR > 0 && minEAR / maxEAR < EAR_ASYMMETRY_RATIO) {
			if (!this.blinking) {
				const eye = leftEAR < rightEAR ? this.leftEye : this.rightEye;
				eye.lowMs += dt_ms;
				if (eye.lowMs >= EAR_MIN_LOW_MS) {
					this.blinking = true;
					this.pendingBlink = true;
					return makeResult(true);
				}
			}
			return makeResult(false);
		}

		// Signal 3: per-eye EAR + drop-rate gate
		if (this.leftEye.baseline === null || this.rightEye.baseline === null) {
			return { ...makeResult(false), calibrated: false };
		}

		if (!this.blinking) {
			const leftFire = this.eyeBlinkEntry(this.leftEye, dt_ms);
			const rightFire = this.eyeBlinkEntry(this.rightEye, dt_ms);
			if (leftFire || rightFire) {
				this.blinking = true;
				this.pendingBlink = true;
				return makeResult(true);
			}
		} else if (
			this.bothEyesOpen() &&
			blendLeft < BLENDSHAPE_BLINK_EXIT &&
			blendRight < BLENDSHAPE_BLINK_EXIT
		) {
			this.blinking = false;
			this.leftEye.lowMs = 0;
			this.rightEye.lowMs = 0;
			this.leftEye.blendLowMs = 0;
			this.rightEye.blendLowMs = 0;
			this.leftEye.prevSmoothed = null;
			this.rightEye.prevSmoothed = null;
		}

		return makeResult(false);
	}

	resetHistory(): void {
		this.blinking = false;
		this.leftEye = newEyeState();
		this.rightEye = newEyeState();
		this.missingFaceMs = 0;
		this.missingEyeMs = 0;
		this.lastInferenceTime = 0;
		this.lastInferenceTimestamp = 0;
		this.pendingBlink = false;
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
		this.faceLandmarker?.close();
		this.faceLandmarker = null;
		this.resetHistory();
	}
}
