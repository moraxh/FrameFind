export const GLASSES_MODEL_URL = "https://cdn.framefind.moraxh.dev/glasses/v1/glasses.onnx";

export type DetectionResult = {
  glasses: boolean;
  probability: number;
  faceDetected: boolean;
};

export type DetectorConfig = {
  modelUrl: string;
  threshold?: number;
  smoothingWindow?: number;
};

export const DEFAULT_THRESHOLD = 0.35;
export const DEFAULT_SMOOTH_N = 8;
export const ROI_SIZE = 112;
export const MEAN: [number, number, number] = [0.485, 0.456, 0.406];
export const STD: [number, number, number] = [0.229, 0.224, 0.225];
export const EYE_REGION_IDX: number[] = [
  33, 133, 159, 145, 158, 153, 144, 163, 7, 246,
  362, 263, 386, 374, 385, 380, 373, 390, 249, 466,
  70, 63, 105, 66, 107, 336, 296, 334, 293, 300,
  168, 6, 197, 195,
];

export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export function smoothAverage(history: number[]): number {
  if (history.length === 0) return 0;
  return history.reduce((a, b) => a + b, 0) / history.length;
}

export function imageDataToChwFloat32(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): Float32Array {
  const n = width * height;
  const t = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    t[i]         = (pixels[i * 4]     / 255 - MEAN[0]) / STD[0];
    t[n + i]     = (pixels[i * 4 + 1] / 255 - MEAN[1]) / STD[1];
    t[2 * n + i] = (pixels[i * 4 + 2] / 255 - MEAN[2]) / STD[2];
  }
  return t;
}
