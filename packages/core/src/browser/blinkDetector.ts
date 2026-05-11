import type { FaceLandmarker } from "@mediapipe/tasks-vision";

const EAR_SMOOTH_TAU_MS = 70;
const EAR_BASELINE_TAU_MS = 3000;
const EAR_ENTER_RATIO = 0.65;
const EAR_EXIT_RATIO = 0.7;
const EAR_MIN_LOW_MS = 60;
const EAR_MIN_DROP_PER_SEC = 1.2;
const BASELINE_WARMUP_MS = 500;
const MISSING_FACE_MS = 165;
const EAR_ASYMMETRY_RATIO = 0.45;

const BLENDSHAPE_BLINK_ENTER = 0.5;
const BLENDSHAPE_BLINK_EXIT = 0.5;
const BLENDSHAPE_MIN_LOW_MS = 50;

// Minimum time between consecutive blink fires (refractory period).
const BLINK_REFRACTORY_MS = 180;
// Blendshape must drop at least this much after a blink fire before we'll re-arm.
const BLINK_RELAX_DELTA = 0.15;

const LEFT_EYE = [362, 385, 387, 263, 373, 380];
const RIGHT_EYE = [33, 160, 158, 133, 153, 144];

const DEFAULT_FACE_LANDMARKER_MODEL =
	"https://cdn.framefind.moraxh.dev/mediapipe/models/face_landmarker/v1/face_landmarker.task";
const DEFAULT_MEDIAPIPE_WASM =
	"https://cdn.framefind.moraxh.dev/mediapipe/tasks-vision/0.10.35/wasm";

export type Point2D = { x: number; y: number };

export type BlinkDetectorOptions = {
	faceLandmarkerModelUrl?: string;
	mediapipeWasmPath?: string;
	preferGpu?: boolean;
	minFaceDetectionConfidence?: number;
	minFacePresenceConfidence?: number;
	minTrackingConfidence?: number;
	onBlink?: (ear: number) => void;
	onEARChange?: (ear: number) => void;
	onLandmarks?: (landmarks: Point2D[] | null) => void;
	onFaceLost?: () => void;
};

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
		const point = landmarks[i];
		return (
			point !== undefined &&
			Number.isFinite(point.x) &&
			Number.isFinite(point.y) &&
			point.x >= 0 &&
			point.x <= 1 &&
			point.y >= 0 &&
			point.y <= 1
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
	private blinking: boolean;
	private opts: Required<
		Omit<
			BlinkDetectorOptions,
			"onBlink" | "onEARChange" | "onLandmarks" | "onFaceLost"
		>
	>;
	private onBlinkCb: ((ear: number) => void) | null;
	private onFaceLostCb: (() => void) | null;
	private onEARChangeCb: ((ear: number) => void) | null;
	private onLandmarksCb: ((landmarks: Point2D[] | null) => void) | null;
	private faceLandmarker: FaceLandmarker | null;
	private lastVideoTime: number;
	private lastInferenceTime: number;
	private lastInferenceTimestamp: number;
	private leftEye: EyeState;
	private rightEye: EyeState;
	private missingFaceMs: number;
	private missingEyeMs: number;
	private lastBlinkAt: number;
	private maxBlendSinceFire: number;
	private relaxedSinceFire: boolean;
	private blinkStartedAt: number | null;

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
		this.onBlinkCb = opts.onBlink ?? null;
		this.onEARChangeCb = opts.onEARChange ?? null;
		this.onLandmarksCb = opts.onLandmarks ?? null;
		this.onFaceLostCb = opts.onFaceLost ?? null;

		this.blinking = false;
		this.faceLandmarker = null;
		this.lastVideoTime = -1;
		this.lastInferenceTime = 0;
		this.lastInferenceTimestamp = 0;
		this.leftEye = newEyeState();
		this.rightEye = newEyeState();
		this.missingFaceMs = 0;
		this.missingEyeMs = 0;
		this.lastBlinkAt = -Infinity;
		this.maxBlendSinceFire = 0;
		this.relaxedSinceFire = true;
		this.blinkStartedAt = null;
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

	setCallbacks(opts: {
		onBlink?: (ear: number) => void;
		onEARChange?: (ear: number) => void;
		onLandmarks?: (landmarks: Point2D[] | null) => void;
		onFaceLost?: () => void;
	}): void {
		if (opts.onBlink !== undefined) this.onBlinkCb = opts.onBlink;
		if (opts.onEARChange !== undefined) this.onEARChangeCb = opts.onEARChange;
		if (opts.onLandmarks !== undefined) this.onLandmarksCb = opts.onLandmarks;
		if (opts.onFaceLost !== undefined) this.onFaceLostCb = opts.onFaceLost;
	}

	get baselineEarValue(): number | null {
		const l = this.leftEye.baseline;
		const r = this.rightEye.baseline;
		if (l === null && r === null) return null;
		if (l === null) return r;
		if (r === null) return l;
		return (l + r) / 2;
	}

	get smoothedEarValue(): number | null {
		const l = this.leftEye.smoothed;
		const r = this.rightEye.smoothed;
		if (l === null && r === null) return null;
		if (l === null) return r;
		if (r === null) return l;
		return (l + r) / 2;
	}

	get isBlinking(): boolean {
		return this.blinking;
	}

	/** Milliseconds the eyes have been continuously closed. 0 when open. */
	get blinkDurationMs(): number {
		if (!this.blinking || this.blinkStartedAt === null) return 0;
		return performance.now() - this.blinkStartedAt;
	}

	private updateEyeSmooth(
		eye: EyeState,
		raw: number,
		dt_ms: number,
		now: number,
	): void {
		eye.prevSmoothed = eye.smoothed;
		const smoothAlpha = 1 - Math.exp(-dt_ms / EAR_SMOOTH_TAU_MS);
		eye.smoothed =
			eye.smoothed === null
				? raw
				: eye.smoothed * (1 - smoothAlpha) + raw * smoothAlpha;

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
			const baselineAlpha = 1 - Math.exp(-dt_ms / EAR_BASELINE_TAU_MS);
			eye.baseline =
				eye.baseline * (1 - baselineAlpha) + eye.smoothed * baselineAlpha;
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

	private processResults(
		results: {
			faceLandmarks?: Point2D[][];
			faceBlendshapes?: {
				categories: { categoryName: string; score: number }[];
			}[];
		},
		now: number,
	): void {
		const dt_ms =
			this.lastInferenceTimestamp > 0
				? Math.min(now - this.lastInferenceTimestamp, 200)
				: 33;
		this.lastInferenceTimestamp = now;

		if (!results.faceLandmarks?.length) {
			this.onLandmarksCb?.(null);
			this.missingFaceMs += dt_ms;
			if (
				this.missingFaceMs >= MISSING_FACE_MS &&
				now - this.lastBlinkAt >= BLINK_REFRACTORY_MS
			) {
				this.lastBlinkAt = now;
				this.relaxedSinceFire = false;
				this.blinking = true;
				if (this.onFaceLostCb) {
					this.onFaceLostCb();
				} else {
					this.onBlinkCb?.(0);
				}
			}
			return;
		}

		this.missingFaceMs = 0;

		const lm = results.faceLandmarks[0];
		this.onLandmarksCb?.(lm);

		const leftValid = isEyeValid(lm, LEFT_EYE);
		const rightValid = isEyeValid(lm, RIGHT_EYE);
		const leftEAR = leftValid ? eyeAspectRatio(lm, LEFT_EYE) : null;
		const rightEAR = rightValid ? eyeAspectRatio(lm, RIGHT_EYE) : null;

		if (!leftValid || !rightValid || leftEAR === null || rightEAR === null) {
			this.missingEyeMs += dt_ms;
			if (
				this.missingEyeMs >= MISSING_FACE_MS &&
				now - this.lastBlinkAt >= BLINK_REFRACTORY_MS
			) {
				this.lastBlinkAt = now;
				this.relaxedSinceFire = false;
				this.blinking = true;
				if (this.onFaceLostCb) {
					this.onFaceLostCb();
				} else {
					this.onBlinkCb?.(0);
				}
			}
			return;
		}

		this.missingEyeMs = 0;

		const cats = results.faceBlendshapes?.[0]?.categories ?? [];
		let blendLeft = 0;
		let blendRight = 0;
		for (const c of cats) {
			if (c.categoryName === "eyeBlinkLeft") blendLeft = c.score;
			else if (c.categoryName === "eyeBlinkRight") blendRight = c.score;
		}

		const updateBlend = (eye: EyeState, score: number): boolean => {
			if (score >= BLENDSHAPE_BLINK_ENTER) {
				eye.blendLowMs += dt_ms;
				return eye.blendLowMs >= BLENDSHAPE_MIN_LOW_MS;
			}
			if (score < BLENDSHAPE_BLINK_EXIT) {
				eye.blendLowMs = 0;
			}
			return false;
		};

		const blendLeftFire = updateBlend(this.leftEye, blendLeft);
		const blendRightFire = updateBlend(this.rightEye, blendRight);

		this.updateEyeSmooth(this.leftEye, leftEAR, dt_ms, now);
		this.updateEyeSmooth(this.rightEye, rightEAR, dt_ms, now);

		const avgSmoothed =
			((this.leftEye.smoothed ?? leftEAR) +
				(this.rightEye.smoothed ?? rightEAR)) /
			2;
		this.onEARChangeCb?.(avgSmoothed);

		const maxBlend = Math.max(blendLeft, blendRight);
		if (maxBlend > this.maxBlendSinceFire) this.maxBlendSinceFire = maxBlend;
		// Re-arm: blendshape dropped enough below the post-fire peak OR clearly open.
		if (
			!this.relaxedSinceFire &&
			(maxBlend < BLENDSHAPE_BLINK_EXIT ||
				maxBlend <= this.maxBlendSinceFire - BLINK_RELAX_DELTA)
		) {
			this.relaxedSinceFire = true;
			this.maxBlendSinceFire = maxBlend;
		}

		const canFire =
			now - this.lastBlinkAt >= BLINK_REFRACTORY_MS && this.relaxedSinceFire;

		const fire = (ear: number) => {
			this.lastBlinkAt = now;
			this.relaxedSinceFire = false;
			this.maxBlendSinceFire = maxBlend;
			if (!this.blinking) this.blinkStartedAt = now;
			this.blinking = true;
			this.leftEye.blendLowMs = 0;
			this.rightEye.blendLowMs = 0;
			this.leftEye.lowMs = 0;
			this.rightEye.lowMs = 0;
			this.onBlinkCb?.(ear);
		};

		// Visual "closed" state for UI (independent of fire gate).
		const visuallyClosed =
			blendLeft >= BLENDSHAPE_BLINK_ENTER || blendRight >= BLENDSHAPE_BLINK_ENTER;
		if (!visuallyClosed) {
			const open =
				this.bothEyesOpen() &&
				blendLeft < BLENDSHAPE_BLINK_EXIT &&
				blendRight < BLENDSHAPE_BLINK_EXIT;
			if (open) {
				this.blinking = false;
				this.blinkStartedAt = null;
				this.leftEye.prevSmoothed = null;
				this.rightEye.prevSmoothed = null;
			}
		}

		if (canFire && (blendLeftFire || blendRightFire)) {
			fire(Math.min(leftEAR, rightEAR));
			return;
		}

		const maxEAR = Math.max(leftEAR, rightEAR);
		const minEAR = Math.min(leftEAR, rightEAR);
		if (maxEAR > 0 && minEAR / maxEAR < EAR_ASYMMETRY_RATIO) {
			if (canFire) {
				const eye = leftEAR < rightEAR ? this.leftEye : this.rightEye;
				eye.lowMs += dt_ms;
				if (eye.lowMs >= EAR_MIN_LOW_MS) {
					fire(minEAR);
				}
			}
			return;
		}

		if (this.leftEye.baseline === null || this.rightEye.baseline === null) {
			return;
		}

		if (canFire) {
			const leftFire = this.eyeBlinkEntry(this.leftEye, dt_ms);
			const rightFire = this.eyeBlinkEntry(this.rightEye, dt_ms);
			if (leftFire || rightFire) {
				fire(
					Math.min(
						this.leftEye.smoothed ?? leftEAR,
						this.rightEye.smoothed ?? rightEAR,
					),
				);
			}
		}
	}

	processFrame(video: HTMLVideoElement): Point2D[] | null {
		if (!this.faceLandmarker) return null;

		if (
			video.readyState < 2 ||
			video.videoWidth === 0 ||
			video.videoHeight === 0
		) {
			return null;
		}

		if (video.currentTime === this.lastVideoTime) return null;

		const now = performance.now();
		if (now - this.lastInferenceTime < 30) return null;

		this.lastVideoTime = video.currentTime;
		this.lastInferenceTime = now;

		const results = this.faceLandmarker.detectForVideo(video, now);
		this.processResults(results, now);
		return results.faceLandmarks?.[0] ?? null;
	}

	resetHistory(): void {
		this.blinking = false;
		this.missingFaceMs = 0;
		this.missingEyeMs = 0;
		this.leftEye = newEyeState();
		this.rightEye = newEyeState();
		this.lastInferenceTimestamp = 0;
		this.lastVideoTime = -1;
		this.lastInferenceTime = 0;
		this.lastBlinkAt = -Infinity;
		this.maxBlendSinceFire = 0;
		this.relaxedSinceFire = true;
		this.blinkStartedAt = null;
	}

	dispose(): void {
		this.faceLandmarker?.close();
		this.faceLandmarker = null;
		this.resetHistory();
	}
}
