import {
	argmax,
	DEFAULT_MASK_SMOOTH_N,
	DEFAULT_MASK_THRESHOLD,
	imageDataToChwFloat32,
	MASK_CLASS_NAMES,
	type MaskClass,
	type MaskDetectionResult,
	MASK_PAD,
	MASK_PAD_BOTTOM_MULT,
	MASK_PAD_TOP_MULT,
	ROI_SIZE,
	softmax,
} from "@framefind/utils";
import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import type { InferenceSession } from "onnxruntime-web";

export type MaskDetectorOptions = {
	modelUrl?: string;
	wasmPaths?: string;
	/** Threshold on smoothed `with_mask` probability for the boolean `mask` flag. */
	threshold?: number;
	smoothingWindow?: number;
	autoLandmarks?: boolean;
	faceLandmarkerModelUrl?: string;
	mediapipeWasmPath?: string;
	minFaceDetectionConfidence?: number;
	minFacePresenceConfidence?: number;
	inferenceIntervalMs?: number;
	preferGpu?: boolean;
};

type Landmark = { x: number; y: number; z: number };
type Roi = { x: number; y: number; w: number; h: number };

const DEFAULT_FACE_LANDMARKER_MODEL =
	"https://cdn.framefind.moraxh.dev/mediapipe/models/face_landmarker/v1/face_landmarker.task";
const DEFAULT_MEDIAPIPE_WASM =
	"https://cdn.framefind.moraxh.dev/mediapipe/tasks-vision/0.10.35/wasm";
const DEFAULT_CONFIDENCE = 0.5;

const EMPTY_RESULT: MaskDetectionResult = {
	label: "without_mask",
	probability: 0,
	probabilities: [0, 0, 0],
	mask: false,
	faceDetected: false,
};

export class MaskDetector {
	private session: InferenceSession | null = null;
	private faceLandmarker: FaceLandmarker | null = null;
	private probHistory: Array<[number, number, number]> = [];
	private threshold: number;
	private smoothN: number;
	private modelUrl: string;
	private wasmPaths: string;
	private autoLandmarks: boolean;
	private faceLandmarkerModelUrl: string;
	private mediapipeWasmPath: string;
	private minFaceDetectionConfidence: number;
	private minFacePresenceConfidence: number;
	private inferenceIntervalMs: number;
	private preferGpu: boolean;
	private lastVideoTime = -1;
	private lastInferenceTs = -Infinity;
	private lastResult: MaskDetectionResult = { ...EMPTY_RESULT };

	constructor(opts: MaskDetectorOptions) {
		this.modelUrl =
			opts.modelUrl ??
			"https://cdn.framefind.moraxh.dev/models/mask/v1/mask.onnx";
		this.threshold = opts.threshold ?? DEFAULT_MASK_THRESHOLD;
		this.smoothN = opts.smoothingWindow ?? DEFAULT_MASK_SMOOTH_N;
		this.wasmPaths =
			opts.wasmPaths ??
			"https://cdn.framefind.moraxh.dev/onnxruntime-web/1.25.1/dist/";
		this.autoLandmarks = opts.autoLandmarks ?? true;
		this.faceLandmarkerModelUrl =
			opts.faceLandmarkerModelUrl ?? DEFAULT_FACE_LANDMARKER_MODEL;
		this.mediapipeWasmPath = opts.mediapipeWasmPath ?? DEFAULT_MEDIAPIPE_WASM;
		this.minFaceDetectionConfidence =
			opts.minFaceDetectionConfidence ?? DEFAULT_CONFIDENCE;
		this.minFacePresenceConfidence =
			opts.minFacePresenceConfidence ?? DEFAULT_CONFIDENCE;
		this.inferenceIntervalMs = opts.inferenceIntervalMs ?? 0;
		this.preferGpu = opts.preferGpu ?? true;
	}

	setInferenceInterval(ms: number): void {
		this.inferenceIntervalMs = Math.max(0, ms);
	}

	async load(): Promise<void> {
		const ort = await import("onnxruntime-web");
		ort.env.wasm.wasmPaths = this.wasmPaths;
		ort.env.wasm.numThreads = 1;
		this.session = await ort.InferenceSession.create(this.modelUrl, {
			executionProviders: ["wasm"],
		});

		if (this.autoLandmarks) {
			try {
				this.faceLandmarker = await silenceMediapipeInfo(async () => {
					const vision = await import("@mediapipe/tasks-vision");
					const fileset = await vision.FilesetResolver.forVisionTasks(
						this.mediapipeWasmPath,
					);
					const baseConfig = {
						runningMode: "VIDEO" as const,
						numFaces: 1,
						minFaceDetectionConfidence: this.minFaceDetectionConfidence,
						minFacePresenceConfidence: this.minFacePresenceConfidence,
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
								"[MaskDetector] GPU delegate failed, falling back to CPU.",
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
			} catch {
				// @mediapipe/tasks-vision not installed — autoLandmarks disabled, falls back to center-crop
			}
		}
	}

	private detectLandmarksFromVideo(
		video: HTMLVideoElement,
	): Landmark[] | undefined {
		if (!this.faceLandmarker) return undefined;
		if (video.readyState < 2 || video.videoWidth === 0) return undefined;
		const res = this.faceLandmarker.detectForVideo(video, performance.now());
		return res.faceLandmarks?.[0];
	}

	private async detectLandmarksFromImageAsync(
		source: HTMLCanvasElement | HTMLImageElement | ImageBitmap,
	): Promise<Landmark[] | undefined> {
		if (!this.faceLandmarker) return undefined;
		const lm = this.faceLandmarker as unknown as {
			setOptions: (o: { runningMode: "IMAGE" | "VIDEO" }) => Promise<void>;
			detect: (s: HTMLCanvasElement | HTMLImageElement | ImageBitmap) => {
				faceLandmarks?: Landmark[][];
			};
		};
		try {
			await lm.setOptions({ runningMode: "IMAGE" });
			const res = lm.detect(source);
			await lm.setOptions({ runningMode: "VIDEO" });
			return res.faceLandmarks?.[0];
		} catch {
			return undefined;
		}
	}

	async detectFromImageData(
		pixels: Uint8ClampedArray,
		width: number,
		height: number,
		landmarks?: Landmark[],
	): Promise<MaskDetectionResult> {
		if (!this.session) throw new Error("Call load() first");

		let roi: Roi | null = null;
		let faceDetected = false;

		if (landmarks && landmarks.length > 0) {
			faceDetected = true;
			roi = extractFaceROI(landmarks, width, height);
		}

		const tensor = roi
			? cropAndPreprocess(pixels, width, roi)
			: centerCropPreprocess(pixels, width, height);

		const ort = await import("onnxruntime-web");
		const input = new ort.Tensor("float32", tensor, [1, 3, ROI_SIZE, ROI_SIZE]);
		const out = await this.session.run({ input });
		const logits = out["logits"].data as Float32Array;
		const probs = softmax(logits) as number[];
		const triple: [number, number, number] = [probs[0], probs[1], probs[2]];

		this.probHistory.push(triple);
		if (this.probHistory.length > this.smoothN) this.probHistory.shift();

		const smoothed = averageTriple(this.probHistory);
		return this.buildResult(smoothed, faceDetected);
	}

	async detectFromCanvas(
		canvas: HTMLCanvasElement,
		landmarks?: Landmark[],
	): Promise<MaskDetectionResult> {
		const ctx = canvas.getContext("2d", { willReadFrequently: true });
		if (!ctx) throw new Error("Cannot get 2d context");
		const { width, height } = canvas;
		const lm = landmarks ?? (await this.detectLandmarksFromImageAsync(canvas));
		const pixels = ctx.getImageData(0, 0, width, height).data;
		return this.detectFromImageData(pixels, width, height, lm);
	}

	async detectFromVideoFrame(
		video: HTMLVideoElement,
		offscreenCanvas: HTMLCanvasElement | OffscreenCanvas,
		landmarks?: Landmark[],
	): Promise<MaskDetectionResult> {
		const now = performance.now();
		if (now - this.lastInferenceTs < this.inferenceIntervalMs) {
			return this.lastResult;
		}
		this.lastInferenceTs = now;

		const ctx = offscreenCanvas.getContext("2d", { willReadFrequently: true });
		if (!ctx) throw new Error("Cannot get 2d context");
		const vw = video.videoWidth;
		const vh = video.videoHeight;

		let lm = landmarks;
		let faceDetected = false;

		if (!landmarks && video.currentTime !== this.lastVideoTime) {
			this.lastVideoTime = video.currentTime;
			lm = this.detectLandmarksFromVideo(video);
		}

		let roi: Roi | null = null;

		if (lm && lm.length > 0) {
			faceDetected = true;
			roi = extractFaceROI(lm, vw, vh);
		}

		offscreenCanvas.width = offscreenCanvas.height = ROI_SIZE;

		if (roi) {
			ctx.drawImage(
				video,
				roi.x,
				roi.y,
				roi.w,
				roi.h,
				0,
				0,
				ROI_SIZE,
				ROI_SIZE,
			);
		} else {
			const sq = Math.min(vw, vh);
			const sx = (vw - sq) / 2;
			const sy = (vh - sq) / 2;
			ctx.drawImage(video, sx, sy, sq, sq, 0, 0, ROI_SIZE, ROI_SIZE);
		}

		const pixels = ctx.getImageData(0, 0, ROI_SIZE, ROI_SIZE).data;

		if (!faceDetected) {
			const smoothed = averageTriple(this.probHistory);
			this.lastResult = this.buildResult(smoothed, false);
			return this.lastResult;
		}

		const result = await this.detectFromImageData(pixels, ROI_SIZE, ROI_SIZE);
		this.lastResult = { ...result, faceDetected };
		return this.lastResult;
	}

	resetHistory(): void {
		this.probHistory = [];
		this.lastVideoTime = -1;
		this.lastInferenceTs = -Infinity;
		this.lastResult = { ...EMPTY_RESULT };
	}

	dispose(): void {
		this.session?.release();
		this.session = null;
		this.faceLandmarker?.close();
		this.faceLandmarker = null;
		this.probHistory = [];
		this.lastVideoTime = -1;
		this.lastInferenceTs = -Infinity;
		this.lastResult = { ...EMPTY_RESULT };
	}

	private buildResult(
		probs: [number, number, number],
		faceDetected: boolean,
	): MaskDetectionResult {
		const idx = argmax(probs);
		const label: MaskClass = MASK_CLASS_NAMES[idx] ?? "without_mask";
		return {
			label,
			probability: probs[idx],
			probabilities: probs,
			mask: probs[0] >= this.threshold,
			faceDetected,
		};
	}
}

function averageTriple(
	history: Array<[number, number, number]>,
): [number, number, number] {
	if (history.length === 0) return [0, 0, 0];
	let a = 0,
		b = 0,
		c = 0;
	for (const h of history) {
		a += h[0];
		b += h[1];
		c += h[2];
	}
	const n = history.length;
	return [a / n, b / n, c / n];
}

function extractFaceROI(
	landmarks: Landmark[],
	vw: number,
	vh: number,
): Roi | null {
	let xMin = Infinity,
		yMin = Infinity,
		xMax = -Infinity,
		yMax = -Infinity;
	for (const p of landmarks) {
		const px = p.x * vw;
		const py = p.y * vh;
		if (px < xMin) xMin = px;
		if (py < yMin) yMin = py;
		if (px > xMax) xMax = px;
		if (py > yMax) yMax = py;
	}
	if (!isFinite(xMin) || !isFinite(yMin)) return null;
	const bw = xMax - xMin;
	const bh = yMax - yMin;
	if (bw <= 0 || bh <= 0) return null;
	const padX = bw * MASK_PAD;
	const padTop = bh * MASK_PAD * MASK_PAD_TOP_MULT;
	const padBottom = bh * MASK_PAD * MASK_PAD_BOTTOM_MULT;
	const x0 = Math.max(0, xMin - padX);
	const y0 = Math.max(0, yMin - padTop);
	const x1 = Math.min(vw, xMax + padX);
	const y1 = Math.min(vh, yMax + padBottom);
	if (x1 <= x0 || y1 <= y0) return null;
	return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function cropAndPreprocess(
	pixels: Uint8ClampedArray,
	srcWidth: number,
	roi: Roi,
): Float32Array {
	const srcHeight = pixels.length / 4 / srcWidth;
	const buf = new ArrayBuffer(pixels.length);
	new Uint8ClampedArray(buf).set(pixels);
	const src = new ImageData(new Uint8ClampedArray(buf), srcWidth, srcHeight);
	const offscreen = new OffscreenCanvas(ROI_SIZE, ROI_SIZE);
	const ctx = offscreen.getContext("2d")!;
	const tmpCanvas = new OffscreenCanvas(srcWidth, srcHeight);
	const tmpCtx = tmpCanvas.getContext("2d")!;
	tmpCtx.putImageData(src, 0, 0);
	ctx.drawImage(
		tmpCanvas,
		roi.x,
		roi.y,
		roi.w,
		roi.h,
		0,
		0,
		ROI_SIZE,
		ROI_SIZE,
	);
	const cropped = ctx.getImageData(0, 0, ROI_SIZE, ROI_SIZE).data;
	return imageDataToChwFloat32(cropped, ROI_SIZE, ROI_SIZE);
}

function centerCropPreprocess(
	pixels: Uint8ClampedArray,
	width: number,
	height: number,
): Float32Array {
	const sq = Math.min(width, height);
	const sx = Math.floor((width - sq) / 2);
	const sy = Math.floor((height - sq) / 2);
	const buf = new ArrayBuffer(pixels.length);
	new Uint8ClampedArray(buf).set(pixels);
	const src = new ImageData(new Uint8ClampedArray(buf), width, height);
	const offscreen = new OffscreenCanvas(ROI_SIZE, ROI_SIZE);
	const ctx = offscreen.getContext("2d")!;
	const tmpCanvas = new OffscreenCanvas(width, height);
	const tmpCtx = tmpCanvas.getContext("2d")!;
	tmpCtx.putImageData(src, 0, 0);
	ctx.drawImage(tmpCanvas, sx, sy, sq, sq, 0, 0, ROI_SIZE, ROI_SIZE);
	const cropped = ctx.getImageData(0, 0, ROI_SIZE, ROI_SIZE).data;
	return imageDataToChwFloat32(cropped, ROI_SIZE, ROI_SIZE);
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
