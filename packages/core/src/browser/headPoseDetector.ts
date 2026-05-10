import {
	angleDelta,
	DEFAULT_POSE_ALPHA,
	type HeadPoseResult,
	OneEuroFilter,
	type OneEuroOptions,
} from "@framefind/utils";
import type { FaceLandmarker } from "@mediapipe/tasks-vision";

export type HeadPoseSmoothing =
	| { type: "ema"; alpha?: number }
	| { type: "oneEuro"; options?: OneEuroOptions }
	| { type: "none" };

export type HeadPoseDetectorOptions = {
	alpha?: number;
	smoothing?: HeadPoseSmoothing;
	faceLandmarkerModelUrl?: string;
	mediapipeWasmPath?: string;
	minFaceDetectionConfidence?: number;
	minFacePresenceConfidence?: number;
	minTrackingConfidence?: number;
	inferenceIntervalMs?: number;
	preferGpu?: boolean;
};

const DEFAULT_FACE_LANDMARKER_MODEL =
	"https://cdn.framefind.moraxh.dev/mediapipe/models/face_landmarker/v1/face_landmarker.task";
const DEFAULT_MEDIAPIPE_WASM =
	"https://cdn.framefind.moraxh.dev/mediapipe/tasks-vision/0.10.35/wasm";
const DEFAULT_CONFIDENCE = 0.5;

export class HeadPoseDetector {
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

	// EMA state
	private alpha: number;
	private smoothingMode: "ema" | "oneEuro" | "none";
	private smoothYaw = 0;
	private smoothPitch = 0;
	private smoothRoll = 0;
	private hasSeenFrame = false;

	// One-Euro state
	private yawFilter: OneEuroFilter;
	private pitchFilter: OneEuroFilter;
	private rollFilter: OneEuroFilter;

	// Cache last result so skipped frames return same value
	private lastResult: HeadPoseResult = {
		yaw: 0,
		pitch: 0,
		roll: 0,
		faceDetected: false,
	};

	constructor(opts: HeadPoseDetectorOptions = {}) {
		this.alpha = opts.alpha ?? DEFAULT_POSE_ALPHA;
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

		const oneEuroOpts =
			smoothing.type === "oneEuro" ? smoothing.options : undefined;
		this.yawFilter = new OneEuroFilter(oneEuroOpts, true);
		this.pitchFilter = new OneEuroFilter(oneEuroOpts, true);
		this.rollFilter = new OneEuroFilter(oneEuroOpts, true);
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
						"[HeadPoseDetector] GPU delegate failed, falling back to CPU.",
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

	detectFromVideo(video: HTMLVideoElement): HeadPoseResult {
		if (!this.faceLandmarker) throw new Error("Call load() first");
		if (video.readyState < 2 || video.videoWidth === 0) {
			this.lastResult = { ...this.lastResult, faceDetected: false };
			return this.lastResult;
		}

		const now = performance.now();
		if (now - this.lastInferenceTs < this.inferenceIntervalMs) {
			return this.lastResult;
		}

		// MediaPipe needs strictly increasing timestamps
		const ts = Math.max(this.monotonicTs + 1, Math.floor(now * 1000));
		this.monotonicTs = ts;
		this.lastInferenceTs = now;

		const result = this.faceLandmarker.detectForVideo(video, ts / 1000);
		const matrix = result.facialTransformationMatrixes?.[0];
		const landmarks = result.faceLandmarks?.[0];

		if (!matrix || !landmarks) {
			this.lastResult = { ...this.lastResult, faceDetected: false };
			return this.lastResult;
		}

		const { yaw, pitch, roll } = matrixToEuler(matrix);
		const tSec = now / 1000;

		let outYaw: number, outPitch: number, outRoll: number;
		if (this.smoothingMode === "none" || !this.hasSeenFrame) {
			outYaw = yaw;
			outPitch = pitch;
			outRoll = roll;
			this.smoothYaw = yaw;
			this.smoothPitch = pitch;
			this.smoothRoll = roll;
			if (this.smoothingMode === "oneEuro") {
				outYaw = this.yawFilter.filter(yaw, tSec);
				outPitch = this.pitchFilter.filter(pitch, tSec);
				outRoll = this.rollFilter.filter(roll, tSec);
			}
			this.hasSeenFrame = true;
		} else if (this.smoothingMode === "oneEuro") {
			outYaw = this.yawFilter.filter(yaw, tSec);
			outPitch = this.pitchFilter.filter(pitch, tSec);
			outRoll = this.rollFilter.filter(roll, tSec);
		} else {
			// EMA with wrap-around handling
			this.smoothYaw += this.alpha * angleDelta(yaw, this.smoothYaw);
			this.smoothPitch += this.alpha * angleDelta(pitch, this.smoothPitch);
			this.smoothRoll += this.alpha * angleDelta(roll, this.smoothRoll);
			outYaw = this.smoothYaw;
			outPitch = this.smoothPitch;
			outRoll = this.smoothRoll;
		}

		this.lastResult = {
			yaw: outYaw,
			pitch: outPitch,
			roll: outRoll,
			faceDetected: true,
			landmarks,
		};
		return this.lastResult;
	}

	setInferenceInterval(ms: number): void {
		this.inferenceIntervalMs = Math.max(0, ms);
	}

	resetSmoothing(): void {
		this.smoothYaw = 0;
		this.smoothPitch = 0;
		this.smoothRoll = 0;
		this.hasSeenFrame = false;
		this.yawFilter.reset();
		this.pitchFilter.reset();
		this.rollFilter.reset();
		this.lastInferenceTs = -Infinity;
		this.monotonicTs = 0;
		this.lastResult = { yaw: 0, pitch: 0, roll: 0, faceDetected: false };
	}

	dispose(): void {
		this.faceLandmarker?.close();
		this.faceLandmarker = null;
		this.resetSmoothing();
	}
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
	const origError = console.error;
	console.info = filter(origInfo).bind(console);
	console.log = filter(origLog).bind(console);
	console.error = filter(origError).bind(console);
	try {
		return await fn();
	} finally {
		console.info = origInfo;
		console.log = origLog;
		console.error = origError;
	}
}

// Column-major 4x4 matrix from MediaPipe → Euler angles in degrees.
// Field names in returned object follow the playground rendering convention
// (yaw/pitch/roll mapped from raw pitch/roll/yaw to align the 3D model).
// Includes gimbal-lock guard when raw pitch ≈ ±90°.
const GIMBAL_LOCK_EPS = 1e-3;

function matrixToEuler(matrix: { data: Float32Array | number[] }): {
	yaw: number;
	pitch: number;
	roll: number;
} {
	const m = matrix.data;

	// Column-major layout: m[col*4 + row]
	const r00 = m[0],
		r10 = m[1],
		r20 = m[2];
	const r01 = m[4],
		r11 = m[5];
	const r21 = m[6],
		r22 = m[10];

	const RAD2DEG = 180 / Math.PI;
	const sy = Math.sqrt(r21 * r21 + r22 * r22);

	let rawYaw: number, rawPitch: number, rawRoll: number;
	if (sy < GIMBAL_LOCK_EPS) {
		// Gimbal lock: pitch ≈ ±90°. Roll-yaw degenerate, fold roll into yaw.
		rawPitch = Math.atan2(-r20, sy) * RAD2DEG;
		rawRoll = 0;
		rawYaw = Math.atan2(-r01, r11) * RAD2DEG;
	} else {
		rawYaw = Math.atan2(r10, r00) * RAD2DEG;
		rawPitch = Math.atan2(-r20, sy) * RAD2DEG;
		rawRoll = Math.atan2(r21, r22) * RAD2DEG;
	}

	// Remap to playground render convention
	return { yaw: rawPitch, pitch: rawRoll, roll: rawYaw };
}
