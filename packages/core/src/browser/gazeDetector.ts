import {
	applyGazeCalibration,
	DEFAULT_GAZE_DEADZONE,
	DEFAULT_GAZE_MIRROR_X,
	DEFAULT_GAZE_MIRROR_Y,
	DEFAULT_GAZE_PITCH_COMPENSATION,
	DEFAULT_GAZE_YAW_COMPENSATION,
	fitGazeCalibration,
	GAZE_ONE_EURO,
	type GazeCalibration,
	type GazeCalibrationSample,
	gazeRegion,
	type GazeResult,
	LEFT_EYE_BOUNDS,
	LEFT_IRIS_IDX,
	OneEuroFilter,
	type OneEuroOptions,
	RIGHT_EYE_BOUNDS,
	RIGHT_IRIS_IDX,
} from "@framefind/utils";
import type { FaceLandmarker } from "@mediapipe/tasks-vision";

export type GazeSmoothing =
	| { type: "oneEuro"; options?: OneEuroOptions }
	| { type: "none" };

export type GazeDetectorOptions = {
	smoothing?: GazeSmoothing;
	faceLandmarkerModelUrl?: string;
	mediapipeWasmPath?: string;
	minFaceDetectionConfidence?: number;
	minFacePresenceConfidence?: number;
	minTrackingConfidence?: number;
	inferenceIntervalMs?: number;
	preferGpu?: boolean;
	/** Multiplier applied to yaw (degrees) when compensating horizontal gaze. */
	yawCompensation?: number;
	/** Multiplier applied to pitch (degrees) when compensating vertical gaze. */
	pitchCompensation?: number;
	/** Half-width of the central "center" region in normalized gaze units. */
	deadzone?: number;
	/** Flip gaze horizontally — set true for mirrored selfie cameras. Default: true. */
	mirrorX?: boolean;
	/** Flip gaze vertically. Default: false. */
	mirrorY?: boolean;
};

type Landmark = { x: number; y: number; z: number };

const DEFAULT_FACE_LANDMARKER_MODEL =
	"https://cdn.framefind.moraxh.dev/mediapipe/models/face_landmarker/v1/face_landmarker.task";
const DEFAULT_MEDIAPIPE_WASM =
	"https://cdn.framefind.moraxh.dev/mediapipe/tasks-vision/0.10.35/wasm";
const DEFAULT_CONFIDENCE = 0.5;

const EMPTY_RESULT: GazeResult = {
	x: 0,
	y: 0,
	region: "center",
	rawX: 0,
	rawY: 0,
	screen: { x: 0.5, y: 0.5 },
	faceDetected: false,
};

export class GazeDetector {
	private faceLandmarker: FaceLandmarker | null = null;
	private faceLandmarkerModelUrl: string;
	private mediapipeWasmPath: string;
	private minFaceDetectionConfidence: number;
	private minFacePresenceConfidence: number;
	private minTrackingConfidence: number;
	private inferenceIntervalMs: number;
	private preferGpu: boolean;

	private lastInferenceTs = -Infinity;
	private monotonicTs = 0;

	private smoothingMode: "oneEuro" | "none";
	private xFilter: OneEuroFilter;
	private yFilter: OneEuroFilter;

	private yawComp: number;
	private pitchComp: number;
	private deadzone: number;
	private mirrorX: boolean;
	private mirrorY: boolean;

	private lastResult: GazeResult = { ...EMPTY_RESULT };

	private calibrationSamples: GazeCalibrationSample[] = [];
	private calibration: GazeCalibration | null = null;

	private calibAccumX = 0;
	private calibAccumY = 0;
	private calibAccumCount = 0;
	private calibAccumTargetX = 0;
	private calibAccumTargetY = 0;

	constructor(opts: GazeDetectorOptions = {}) {
		const smoothing = opts.smoothing ?? { type: "oneEuro" };
		this.smoothingMode = smoothing.type;
		this.faceLandmarkerModelUrl =
			opts.faceLandmarkerModelUrl ?? DEFAULT_FACE_LANDMARKER_MODEL;
		this.mediapipeWasmPath = opts.mediapipeWasmPath ?? DEFAULT_MEDIAPIPE_WASM;
		this.minFaceDetectionConfidence =
			opts.minFaceDetectionConfidence ?? DEFAULT_CONFIDENCE;
		this.minFacePresenceConfidence =
			opts.minFacePresenceConfidence ?? DEFAULT_CONFIDENCE;
		this.minTrackingConfidence =
			opts.minTrackingConfidence ?? DEFAULT_CONFIDENCE;
		this.inferenceIntervalMs = opts.inferenceIntervalMs ?? 0;
		this.preferGpu = opts.preferGpu ?? true;
		this.yawComp = opts.yawCompensation ?? DEFAULT_GAZE_YAW_COMPENSATION;
		this.pitchComp = opts.pitchCompensation ?? DEFAULT_GAZE_PITCH_COMPENSATION;
		this.deadzone = opts.deadzone ?? DEFAULT_GAZE_DEADZONE;
		this.mirrorX = opts.mirrorX ?? DEFAULT_GAZE_MIRROR_X;
		this.mirrorY = opts.mirrorY ?? DEFAULT_GAZE_MIRROR_Y;

		const oneEuroOpts =
			smoothing.type === "oneEuro"
				? { ...GAZE_ONE_EURO, ...smoothing.options }
				: undefined;
		this.xFilter = new OneEuroFilter(oneEuroOpts, false);
		this.yFilter = new OneEuroFilter(oneEuroOpts, false);
	}

	async load(): Promise<void> {
		this.faceLandmarker = await silenceMediapipeInfo(async () => {
			const vision = await import("@mediapipe/tasks-vision");
			const fileset = await vision.FilesetResolver.forVisionTasks(
				this.mediapipeWasmPath,
			);
			const baseConfig = {
				runningMode: "VIDEO" as const,
				numFaces: 1,
				outputFacialTransformationMatrixes: true,
				minFaceDetectionConfidence: this.minFaceDetectionConfidence,
				minFacePresenceConfidence: this.minFacePresenceConfidence,
				minTrackingConfidence: this.minTrackingConfidence,
			};
			if (this.preferGpu) {
				try {
					return await vision.FaceLandmarker.createFromOptions(fileset, {
						...baseConfig,
						baseOptions: {
							modelAssetPath: this.faceLandmarkerModelUrl,
							delegate: "GPU",
						},
					});
				} catch (e) {
					console.warn(
						"[GazeDetector] GPU delegate failed, falling back to CPU.",
						e,
					);
				}
			}
			return vision.FaceLandmarker.createFromOptions(fileset, {
				...baseConfig,
				baseOptions: {
					modelAssetPath: this.faceLandmarkerModelUrl,
					delegate: "CPU",
				},
			});
		});
	}

	detectFromVideo(video: HTMLVideoElement): GazeResult {
		if (!this.faceLandmarker) return this.lastResult;
		if (video.readyState < 2 || video.videoWidth === 0) {
			this.lastResult = { ...this.lastResult, faceDetected: false };
			return this.lastResult;
		}

		const now = performance.now();
		if (now - this.lastInferenceTs < this.inferenceIntervalMs) {
			return this.lastResult;
		}

		const ts = Math.max(this.monotonicTs + 1, Math.floor(now * 1000));
		this.monotonicTs = ts;
		this.lastInferenceTs = now;

		const result = this.faceLandmarker.detectForVideo(video, ts / 1000);
		const landmarks = result.faceLandmarks?.[0] as Landmark[] | undefined;
		const matrix = result.facialTransformationMatrixes?.[0];

		if (!landmarks || landmarks.length < 478) {
			this.lastResult = { ...this.lastResult, faceDetected: false };
			return this.lastResult;
		}

		const gaze = computeGaze(landmarks);
		const { yaw, pitch } = matrix ? matrixYawPitch(matrix) : { yaw: 0, pitch: 0 };

		// Head-pose compensated raw gaze, before clamping. Calibration is fit against this signal.
		let compRawX = gaze.rawX - yaw * this.yawComp;
		let compRawY = gaze.rawY - pitch * this.pitchComp;
		if (this.mirrorX) compRawX = -compRawX;
		if (this.mirrorY) compRawY = -compRawY;

		// Unclamped normalized gaze. Clamping is deferred until after smoothing so the
		// filter never sees a saturated signal — otherwise gaze sticks at the edges
		// whenever the mapping overshoots [-1, 1], which is common near screen corners.
		let xNorm: number;
		let yNorm: number;

		if (this.calibration) {
			// Calibrated path: affine maps directly to screen [0, 1].
			const mapped = applyGazeCalibration(this.calibration, compRawX, compRawY);
			xNorm = mapped.x * 2 - 1;
			yNorm = mapped.y * 2 - 1;
		} else {
			// Uncalibrated path: head-compensated value is already in [-1, 1] units.
			xNorm = compRawX;
			yNorm = compRawY;
		}

		const tSec = now / 1000;
		let outX = xNorm;
		let outY = yNorm;
		if (this.smoothingMode === "oneEuro") {
			outX = this.xFilter.filter(xNorm, tSec);
			outY = this.yFilter.filter(yNorm, tSec);
		}

		outX = clamp(outX, -1, 1);
		outY = clamp(outY, -1, 1);
		const screenX = (outX + 1) / 2;
		const screenY = (outY + 1) / 2;

		this.lastResult = {
			x: outX,
			y: outY,
			rawX: compRawX,
			rawY: compRawY,
			region: gazeRegion(outX, outY, this.deadzone),
			screen: { x: screenX, y: screenY },
			faceDetected: true,
		};
		return this.lastResult;
	}

	/**
	 * Accumulate one frame toward a calibration sample at (targetX, targetY).
	 * Call repeatedly while the user fixates the target, then call commitCalibrationSample().
	 * Returns false if no face detected.
	 */
	accumulateCalibrationFrame(targetX: number, targetY: number): boolean {
		if (!this.lastResult.faceDetected) return false;
		this.calibAccumX += this.lastResult.rawX;
		this.calibAccumY += this.lastResult.rawY;
		this.calibAccumCount++;
		this.calibAccumTargetX = targetX;
		this.calibAccumTargetY = targetY;
		return true;
	}

	/**
	 * Flush accumulated frames as one averaged calibration sample.
	 * Returns false if no frames were accumulated.
	 */
	commitCalibrationSample(): boolean {
		if (this.calibAccumCount === 0) return false;
		this.calibrationSamples.push({
			rawX: this.calibAccumX / this.calibAccumCount,
			rawY: this.calibAccumY / this.calibAccumCount,
			targetX: this.calibAccumTargetX,
			targetY: this.calibAccumTargetY,
		});
		this.calibAccumX = 0;
		this.calibAccumY = 0;
		this.calibAccumCount = 0;
		return true;
	}

	/** Number of frames accumulated for the current pending sample. */
	getAccumulatedFrameCount(): number {
		return this.calibAccumCount;
	}

	/** Discard pending accumulated frames without committing. */
	discardAccumulatedFrames(): void {
		this.calibAccumX = 0;
		this.calibAccumY = 0;
		this.calibAccumCount = 0;
	}

	/**
	 * Capture one calibration sample. Pass the target screen coords in [0, 1] (0,0 = top-left).
	 * The current head-pose-compensated raw gaze is used.
	 * @deprecated Prefer accumulateCalibrationFrame + commitCalibrationSample for better accuracy.
	 */
	addCalibrationSample(targetX: number, targetY: number): boolean {
		if (!this.lastResult.faceDetected) return false;
		this.calibrationSamples.push({
			rawX: this.lastResult.rawX,
			rawY: this.lastResult.rawY,
			targetX,
			targetY,
		});
		return true;
	}

	/**
	 * Append a sample with explicit raw values. Useful when capturing averaged samples
	 * over several frames outside the detector.
	 */
	pushCalibrationSample(sample: GazeCalibrationSample): void {
		this.calibrationSamples.push(sample);
	}

	/** Fit affine transform from collected samples. Returns the new calibration or null if it failed. */
	calibrate(): GazeCalibration | null {
		const cal = fitGazeCalibration(this.calibrationSamples);
		this.calibration = cal;
		return cal;
	}

	/** Inject a pre-computed calibration (e.g. restored from storage). */
	setCalibration(cal: GazeCalibration | null): void {
		this.calibration = cal;
	}

	getCalibration(): GazeCalibration | null {
		return this.calibration;
	}

	getCalibrationSampleCount(): number {
		return this.calibrationSamples.length;
	}

	isCalibrated(): boolean {
		return this.calibration !== null;
	}

	clearCalibration(): void {
		this.calibrationSamples = [];
		this.calibration = null;
		this.discardAccumulatedFrames();
	}

	setInferenceInterval(ms: number): void {
		this.inferenceIntervalMs = Math.max(0, ms);
	}

	resetSmoothing(): void {
		this.xFilter.reset();
		this.yFilter.reset();
		this.lastInferenceTs = -Infinity;
		this.monotonicTs = 0;
		this.lastResult = { ...EMPTY_RESULT };
	}

	dispose(): void {
		this.faceLandmarker?.close();
		this.faceLandmarker = null;
		this.resetSmoothing();
		this.clearCalibration();
	}
}

function computeGaze(landmarks: Landmark[]): { rawX: number; rawY: number } {
	const left = irisInEye(
		landmarks,
		LEFT_IRIS_IDX,
		LEFT_EYE_BOUNDS.outer,
		LEFT_EYE_BOUNDS.inner,
		LEFT_EYE_BOUNDS.top,
		LEFT_EYE_BOUNDS.bottom,
	);
	const right = irisInEye(
		landmarks,
		RIGHT_IRIS_IDX,
		// For right eye, "outer" (263) sits to the right and "inner" (362) to the left in image space.
		RIGHT_EYE_BOUNDS.inner,
		RIGHT_EYE_BOUNDS.outer,
		RIGHT_EYE_BOUNDS.top,
		RIGHT_EYE_BOUNDS.bottom,
	);
	return {
		rawX: (left.x + right.x) / 2,
		rawY: (left.y + right.y) / 2,
	};
}

function irisInEye(
	lm: Landmark[],
	irisIndices: readonly number[],
	leftBoundIdx: number,
	rightBoundIdx: number,
	topIdx: number,
	bottomIdx: number,
): { x: number; y: number } {
	// Average all 5 iris landmark points for a more stable center estimate.
	let ix = 0, iy = 0;
	for (const i of irisIndices) { ix += lm[i].x; iy += lm[i].y; }
	ix /= irisIndices.length;
	iy /= irisIndices.length;

	const xL = lm[leftBoundIdx].x;
	const xR = lm[rightBoundIdx].x;
	const yT = lm[topIdx].y;
	const yB = lm[bottomIdx].y;
	const w = xR - xL;
	const h = yB - yT;
	if (w === 0 || h === 0) return { x: 0, y: 0 };
	// Map iris position from eye bbox center to [-1, 1].
	const cx = (xL + xR) / 2;
	const cy = (yT + yB) / 2;
	return {
		x: clamp((ix - cx) / (w / 2), -1.5, 1.5),
		y: clamp((iy - cy) / (h / 2), -1.5, 1.5),
	};
}

function clamp(v: number, lo: number, hi: number): number {
	return v < lo ? lo : v > hi ? hi : v;
}

const GIMBAL_LOCK_EPS = 1e-3;

// Extract yaw + pitch in degrees from MediaPipe transformation matrix.
function matrixYawPitch(matrix: { data: Float32Array | number[] }): {
	yaw: number;
	pitch: number;
} {
	const m = matrix.data;
	const r10 = m[1],
		r20 = m[2];
	const r00 = m[0];
	const r21 = m[6],
		r22 = m[10];
	const RAD2DEG = 180 / Math.PI;
	const sy = Math.sqrt(r21 * r21 + r22 * r22);
	let yaw: number, pitch: number;
	if (sy < GIMBAL_LOCK_EPS) {
		yaw = 0;
		pitch = Math.atan2(-r20, sy) * RAD2DEG;
	} else {
		yaw = Math.atan2(r10, r00) * RAD2DEG;
		pitch = Math.atan2(-r20, sy) * RAD2DEG;
	}
	return { yaw, pitch };
}

async function silenceMediapipeInfo<T>(fn: () => Promise<T>): Promise<T> {
	const filter =
		(orig: (...a: unknown[]) => void) =>
		(...args: unknown[]) => {
			if (
				typeof args[0] === "string" &&
				args[0].includes("Created TensorFlow Lite XNNPACK delegate")
			)
				return;
			orig(...args);
		};
	const origInfo = console.info;
	const origLog = console.log;
	console.info = filter(origInfo).bind(console);
	console.log = filter(origLog).bind(console);
	try {
		return await fn();
	} finally {
		console.info = origInfo;
		console.log = origLog;
	}
}
