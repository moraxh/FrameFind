export const GLASSES_MODEL_URL = "https://cdn.framefind.moraxh.dev/glasses/v1/glasses.onnx";

export type HeadPoseLandmark = { x: number; y: number; z: number };

export type HeadPoseResult = {
  yaw: number;
  pitch: number;
  roll: number;
  faceDetected: boolean;
  landmarks?: HeadPoseLandmark[];
};

export const DEFAULT_POSE_ALPHA = 0.15;

export type OneEuroOptions = {
  minCutoff?: number;
  beta?: number;
  dCutoff?: number;
};

export const DEFAULT_ONE_EURO: Required<OneEuroOptions> = {
  minCutoff: 1.0,
  beta: 0.05,
  dCutoff: 1.0,
};

// Wrap angle delta to [-180, 180] degrees
export function angleDelta(target: number, current: number): number {
  return ((target - current + 540) % 360) - 180;
}

// One-Euro filter for low-lag smoothing. Adaptive cutoff: more smoothing at rest, less when moving fast.
// Reference: Casiez et al., "1€ Filter" (CHI 2012).
export class OneEuroFilter {
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;
  private xPrev: number | null = null;
  private dxPrev = 0;
  private tPrev = 0;
  private wrap: boolean;

  constructor(opts: OneEuroOptions = {}, wrap = false) {
    this.minCutoff = opts.minCutoff ?? DEFAULT_ONE_EURO.minCutoff;
    this.beta = opts.beta ?? DEFAULT_ONE_EURO.beta;
    this.dCutoff = opts.dCutoff ?? DEFAULT_ONE_EURO.dCutoff;
    this.wrap = wrap;
  }

  reset(): void {
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = 0;
  }

  filter(x: number, tSeconds: number): number {
    if (this.xPrev === null || tSeconds <= this.tPrev) {
      this.xPrev = x;
      this.tPrev = tSeconds;
      this.dxPrev = 0;
      return x;
    }
    const dt = tSeconds - this.tPrev;
    const rawDelta = this.wrap ? angleDelta(x, this.xPrev) : x - this.xPrev;
    const dx = rawDelta / dt;
    const aD = lowPassAlpha(this.dCutoff, dt);
    const dxHat = aD * dx + (1 - aD) * this.dxPrev;
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const a = lowPassAlpha(cutoff, dt);
    const xHat = this.xPrev + a * rawDelta;
    this.xPrev = xHat;
    this.dxPrev = dxHat;
    this.tPrev = tSeconds;
    return xHat;
  }
}

function lowPassAlpha(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

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
