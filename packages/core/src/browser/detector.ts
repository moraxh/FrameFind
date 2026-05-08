import type { InferenceSession } from "onnxruntime-web";
import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import {
  type DetectionResult,
  DEFAULT_THRESHOLD,
  DEFAULT_SMOOTH_N,
  ROI_SIZE,
  EYE_REGION_IDX,
  sigmoid,
  smoothAverage,
  imageDataToChwFloat32,
} from "@framefind/utils";

export type GlassesDetectorOptions = {
  modelUrl?: string;
  wasmPaths?: string;
  threshold?: number;
  smoothingWindow?: number;
  autoLandmarks?: boolean;
  faceLandmarkerModelUrl?: string;
  mediapipeWasmPath?: string;
};

type Landmark = { x: number; y: number; z: number };

const DEFAULT_FACE_LANDMARKER_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const DEFAULT_MEDIAPIPE_WASM =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm";

export class GlassesDetector {
  private session: InferenceSession | null = null;
  private faceLandmarker: FaceLandmarker | null = null;
  private probHistory: number[] = [];
  private threshold: number;
  private smoothN: number;
  private modelUrl: string;
  private wasmPaths: string;
  private autoLandmarks: boolean;
  private faceLandmarkerModelUrl: string;
  private mediapipeWasmPath: string;

  constructor(opts: GlassesDetectorOptions) {
    this.modelUrl = opts.modelUrl ?? "https://cdn.framefind.moraxh.dev/glasses/v1/glasses.onnx";
    this.threshold = opts.threshold ?? DEFAULT_THRESHOLD;
    this.smoothN = opts.smoothingWindow ?? DEFAULT_SMOOTH_N;
    this.wasmPaths = opts.wasmPaths ?? "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.25.1/dist/";
    this.autoLandmarks = opts.autoLandmarks ?? true;
    this.faceLandmarkerModelUrl = opts.faceLandmarkerModelUrl ?? DEFAULT_FACE_LANDMARKER_MODEL;
    this.mediapipeWasmPath = opts.mediapipeWasmPath ?? DEFAULT_MEDIAPIPE_WASM;
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
        const vision = await import("@mediapipe/tasks-vision");
        const fileset = await vision.FilesetResolver.forVisionTasks(this.mediapipeWasmPath);
        this.faceLandmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: this.faceLandmarkerModelUrl, delegate: "GPU" },
          runningMode: "VIDEO",
          numFaces: 1,
        });
      } catch {
        // @mediapipe/tasks-vision not installed — autoLandmarks disabled, falls back to center-crop
      }
    }
  }

  private detectLandmarksFromVideo(video: HTMLVideoElement): Landmark[] | undefined {
    if (!this.faceLandmarker) return undefined;
    if (video.readyState < 2 || video.videoWidth === 0) return undefined;
    const res = this.faceLandmarker.detectForVideo(video, performance.now());
    return res.faceLandmarks?.[0];
  }

  private detectLandmarksFromImage(
    source: HTMLCanvasElement | HTMLImageElement | ImageBitmap,
  ): Landmark[] | undefined {
    if (!this.faceLandmarker) return undefined;
    const lm = this.faceLandmarker as unknown as {
      setOptions: (o: { runningMode: "IMAGE" | "VIDEO" }) => Promise<void>;
      detect: (s: HTMLCanvasElement | HTMLImageElement | ImageBitmap) => { faceLandmarks?: Landmark[][] };
    };
    try {
      const res = lm.detect(source);
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
  ): Promise<DetectionResult> {
    if (!this.session) throw new Error("Call load() first");

    let roi: { x: number; y: number; w: number; h: number } | null = null;
    let faceDetected = false;

    if (landmarks && landmarks.length > 0) {
      faceDetected = true;
      roi = extractEyeROI(landmarks, width, height);
    }

    const tensor = roi
      ? cropAndPreprocess(pixels, width, roi)
      : centerCropPreprocess(pixels, width, height);

    const ort = await import("onnxruntime-web");
    const input = new ort.Tensor("float32", tensor, [1, 3, ROI_SIZE, ROI_SIZE]);
    const out = await this.session.run({ input });
    const logit = (out["logit"].data as Float32Array)[0];
    const prob = sigmoid(logit);

    this.probHistory.push(prob);
    if (this.probHistory.length > this.smoothN) this.probHistory.shift();

    const smoothed = smoothAverage(this.probHistory);
    return {
      glasses: smoothed >= this.threshold,
      probability: smoothed,
      faceDetected,
    };
  }

  async detectFromCanvas(
    canvas: HTMLCanvasElement,
    landmarks?: Landmark[],
  ): Promise<DetectionResult> {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Cannot get 2d context");
    const { width, height } = canvas;
    const lm = landmarks ?? this.detectLandmarksFromImage(canvas);
    const pixels = ctx.getImageData(0, 0, width, height).data;
    return this.detectFromImageData(pixels, width, height, lm);
  }

  async detectFromVideoFrame(
    video: HTMLVideoElement,
    offscreenCanvas: HTMLCanvasElement,
    landmarks?: Landmark[],
  ): Promise<DetectionResult> {
    const ctx = offscreenCanvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Cannot get 2d context");
    const vw = video.videoWidth;
    const vh = video.videoHeight;

    const lm = landmarks ?? this.detectLandmarksFromVideo(video);

    let roi: { x: number; y: number; w: number; h: number } | null = null;
    let faceDetected = false;

    if (lm && lm.length > 0) {
      faceDetected = true;
      roi = extractEyeROI(lm, vw, vh);
    }

    offscreenCanvas.width = offscreenCanvas.height = ROI_SIZE;

    if (roi) {
      ctx.drawImage(video, roi.x, roi.y, roi.w, roi.h, 0, 0, ROI_SIZE, ROI_SIZE);
    } else {
      const sq = Math.min(vw, vh);
      const sx = (vw - sq) / 2;
      const sy = (vh - sq) / 2;
      ctx.drawImage(video, sx, sy, sq, sq, 0, 0, ROI_SIZE, ROI_SIZE);
    }

    const pixels = ctx.getImageData(0, 0, ROI_SIZE, ROI_SIZE).data;
    return this.detectFromImageData(pixels, ROI_SIZE, ROI_SIZE, lm);
  }

  resetHistory(): void {
    this.probHistory = [];
  }

  dispose(): void {
    this.session?.release();
    this.session = null;
    this.faceLandmarker?.close();
    this.faceLandmarker = null;
    this.probHistory = [];
  }
}

function extractEyeROI(
  landmarks: Landmark[],
  vw: number,
  vh: number,
): { x: number; y: number; w: number; h: number } | null {
  const pts = EYE_REGION_IDX.map(i => ({
    x: landmarks[i].x * vw,
    y: landmarks[i].y * vh,
  }));
  const xs = pts.map(p => p.x);
  const ys = pts.map(p => p.y);
  const x0r = Math.min(...xs), x1r = Math.max(...xs);
  const y0r = Math.min(...ys), y1r = Math.max(...ys);
  const bw = x1r - x0r, bh = y1r - y0r;
  const side = Math.max(bw, bh) * 1.25;
  const cx = (x0r + x1r) / 2, cy = (y0r + y1r) / 2;
  const x0 = Math.max(0, cx - side / 2);
  const y0 = Math.max(0, cy - side / 2);
  const x1 = Math.min(vw, cx + side / 2);
  const y1 = Math.min(vh, cy + side / 2);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function cropAndPreprocess(
  pixels: Uint8ClampedArray,
  srcWidth: number,
  roi: { x: number; y: number; w: number; h: number },
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
  ctx.drawImage(tmpCanvas, roi.x, roi.y, roi.w, roi.h, 0, 0, ROI_SIZE, ROI_SIZE);
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
