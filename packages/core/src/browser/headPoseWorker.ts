import {
	angleDelta,
	DEFAULT_POSE_ALPHA,
	type HeadPoseResult,
	OneEuroFilter,
	type OneEuroOptions,
} from "@framefind/utils";
import type {
	HeadPoseDetectorOptions,
	HeadPoseSmoothing,
} from "./headPoseDetector.js";

/**
 * Worker-offloaded head pose detector. Mirrors HeadPoseDetector API but runs
 * MediaPipe inference in a Web Worker so the main thread stays responsive.
 *
 * Smoothing happens on the main thread (cheap) so we don't pay round-trip
 * latency per frame for filter state.
 */
export class HeadPoseDetectorWorker {
	private worker: Worker | null = null;
	private readyPromise: Promise<void> | null = null;
	private busy = false;
	private lastInferenceTs = -Infinity;
	private inferenceIntervalMs: number;

	private opts: HeadPoseDetectorOptions;
	private smoothingMode: "ema" | "oneEuro" | "none";
	private alpha: number;
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

	constructor(opts: HeadPoseDetectorOptions = {}) {
		this.opts = opts;
		this.alpha = opts.alpha ?? DEFAULT_POSE_ALPHA;
		const smoothing: HeadPoseSmoothing = opts.smoothing ?? { type: "oneEuro" };
		this.smoothingMode = smoothing.type;
		this.inferenceIntervalMs = opts.inferenceIntervalMs ?? 0;
		const oneEuroOpts: OneEuroOptions | undefined =
			smoothing.type === "oneEuro" ? smoothing.options : undefined;
		this.yawFilter = new OneEuroFilter(oneEuroOpts, true);
		this.pitchFilter = new OneEuroFilter(oneEuroOpts, true);
		this.rollFilter = new OneEuroFilter(oneEuroOpts, true);
	}

	async load(): Promise<void> {
		if (this.readyPromise) return this.readyPromise;
		this.readyPromise = (async () => {
			const blob = new Blob([WORKER_SOURCE], { type: "text/javascript" });
			const url = URL.createObjectURL(blob);
			this.worker = new Worker(url, { type: "module" });
			URL.revokeObjectURL(url);

			await this.rpc("init", {
				faceLandmarkerModelUrl: this.opts.faceLandmarkerModelUrl,
				mediapipeWasmPath: this.opts.mediapipeWasmPath,
				minFaceDetectionConfidence: this.opts.minFaceDetectionConfidence ?? 0.5,
				minFacePresenceConfidence: this.opts.minFacePresenceConfidence ?? 0.5,
				minTrackingConfidence: this.opts.minTrackingConfidence ?? 0.5,
				preferGpu: this.opts.preferGpu ?? true,
			});
		})();
		return this.readyPromise;
	}

	async detectFromVideo(video: HTMLVideoElement): Promise<HeadPoseResult> {
		if (!this.worker) throw new Error("Call load() first");
		if (video.readyState < 2 || video.videoWidth === 0) {
			this.lastResult = { ...this.lastResult, faceDetected: false };
			return this.lastResult;
		}
		const now = performance.now();
		if (now - this.lastInferenceTs < this.inferenceIntervalMs)
			return this.lastResult;
		if (this.busy) return this.lastResult;
		this.busy = true;
		this.lastInferenceTs = now;

		try {
			const bitmap = await createImageBitmap(video);
			const res = await this.rpc<{
				yaw: number;
				pitch: number;
				roll: number;
				faceDetected: boolean;
			}>("detect", { bitmap, ts: now }, [bitmap]);

			if (!res.faceDetected) {
				this.lastResult = { ...this.lastResult, faceDetected: false };
				return this.lastResult;
			}

			const tSec = now / 1000;
			const { yaw, pitch, roll } = res;
			let outYaw: number, outPitch: number, outRoll: number;
			if (this.smoothingMode === "none" || !this.hasSeenFrame) {
				this.smoothYaw = yaw;
				this.smoothPitch = pitch;
				this.smoothRoll = roll;
				if (this.smoothingMode === "oneEuro") {
					outYaw = this.yawFilter.filter(yaw, tSec);
					outPitch = this.pitchFilter.filter(pitch, tSec);
					outRoll = this.rollFilter.filter(roll, tSec);
				} else {
					outYaw = yaw;
					outPitch = pitch;
					outRoll = roll;
				}
				this.hasSeenFrame = true;
			} else if (this.smoothingMode === "oneEuro") {
				outYaw = this.yawFilter.filter(yaw, tSec);
				outPitch = this.pitchFilter.filter(pitch, tSec);
				outRoll = this.rollFilter.filter(roll, tSec);
			} else {
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
			};
			return this.lastResult;
		} finally {
			this.busy = false;
		}
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
		this.lastResult = { yaw: 0, pitch: 0, roll: 0, faceDetected: false };
	}

	dispose(): void {
		this.worker?.terminate();
		this.worker = null;
		this.readyPromise = null;
		this.resetSmoothing();
	}

	private rpc<T = unknown>(
		type: string,
		payload: unknown,
		transfer: Transferable[] = [],
	): Promise<T> {
		return new Promise((resolve, reject) => {
			if (!this.worker) return reject(new Error("Worker disposed"));
			const id = ++rpcId;
			const onMsg = (e: MessageEvent) => {
				const data = e.data as {
					id: number;
					ok: boolean;
					result?: T;
					error?: string;
				};
				if (data.id !== id) return;
				this.worker!.removeEventListener("message", onMsg);
				if (data.ok) resolve(data.result as T);
				else reject(new Error(data.error || "worker error"));
			};
			this.worker.addEventListener("message", onMsg);
			this.worker.postMessage({ id, type, payload }, transfer);
		});
	}
}

let rpcId = 0;

const WORKER_SOURCE = /* js */ `
let landmarker = null;
let monotonicTs = 0;

async function init(payload) {
  const wasmPath = payload.mediapipeWasmPath ?? "https://cdn.framefind.moraxh.dev/mediapipe/tasks-vision/0.10.35/wasm";
  const modelUrl = payload.faceLandmarkerModelUrl ?? "https://cdn.framefind.moraxh.dev/mediapipe/models/face_landmarker/v1/face_landmarker.task";
  const vision = await import("https://cdn.framefind.moraxh.dev/mediapipe/tasks-vision/0.10.35/vision_bundle.mjs");
  const fileset = await vision.FilesetResolver.forVisionTasks(wasmPath);
  const baseConfig = {
    runningMode: "VIDEO",
    numFaces: 1,
    outputFacialTransformationMatrixes: true,
    minFaceDetectionConfidence: payload.minFaceDetectionConfidence,
    minFacePresenceConfidence: payload.minFacePresenceConfidence,
    minTrackingConfidence: payload.minTrackingConfidence,
  };
  if (payload.preferGpu) {
    try {
      landmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
        ...baseConfig,
        baseOptions: { modelAssetPath: modelUrl, delegate: "GPU" },
      });
      return;
    } catch (e) {
      console.warn("[HeadPoseWorker] GPU delegate failed, falling back to CPU.", e);
    }
  }
  landmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
    ...baseConfig,
    baseOptions: { modelAssetPath: modelUrl, delegate: "CPU" },
  });
}

function detect(payload) {
  if (!landmarker) throw new Error("Worker not initialised");
  const bitmap = payload.bitmap;
  const ts = Math.max(monotonicTs + 1, Math.floor(payload.ts * 1000));
  monotonicTs = ts;
  const res = landmarker.detectForVideo(bitmap, ts / 1000);
  bitmap.close && bitmap.close();
  const matrix = res.facialTransformationMatrixes && res.facialTransformationMatrixes[0];
  const lm = res.faceLandmarks && res.faceLandmarks[0];
  if (!matrix || !lm) return { yaw: 0, pitch: 0, roll: 0, faceDetected: false };
  const m = matrix.data;
  const r00 = m[0], r10 = m[1], r20 = m[2];
  const r01 = m[4], r11 = m[5];
  const r21 = m[6], r22 = m[10];
  const RAD = 180 / Math.PI;
  const sy = Math.sqrt(r21 * r21 + r22 * r22);
  let rawYaw, rawPitch, rawRoll;
  if (sy < 1e-3) {
    rawPitch = Math.atan2(-r20, sy) * RAD;
    rawRoll = 0;
    rawYaw = Math.atan2(-r01, r11) * RAD;
  } else {
    rawYaw = Math.atan2(r10, r00) * RAD;
    rawPitch = Math.atan2(-r20, sy) * RAD;
    rawRoll = Math.atan2(r21, r22) * RAD;
  }
  return { yaw: rawPitch, pitch: rawRoll, roll: rawYaw, faceDetected: true };
}

self.onmessage = async (e) => {
  const { id, type, payload } = e.data;
  try {
    let result;
    if (type === "init") result = await init(payload);
    else if (type === "detect") result = detect(payload);
    else throw new Error("unknown type: " + type);
    self.postMessage({ id, ok: true, result });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err && err.message || err) });
  }
};
`;
