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

/** Tuned defaults for gaze: more smoothing at rest, faster response during saccades. */
export const GAZE_ONE_EURO: Required<OneEuroOptions> = {
  minCutoff: 0.5,
  beta: 0.12,
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

export const MASK_MODEL_URL = "https://cdn.framefind.moraxh.dev/models/mask/v1/mask.onnx";

export type MaskClass = "with_mask" | "without_mask" | "incorrect_mask";

export const MASK_CLASS_NAMES: readonly MaskClass[] = [
  "with_mask",
  "without_mask",
  "incorrect_mask",
] as const;

export type MaskDetectionResult = {
  /** Predicted class after smoothing. */
  label: MaskClass;
  /** Smoothed probability of the predicted class. */
  probability: number;
  /** Smoothed per-class probabilities (with_mask, without_mask, incorrect_mask). */
  probabilities: [number, number, number];
  /** Convenience: smoothed `with_mask` probability >= threshold. */
  mask: boolean;
  faceDetected: boolean;
};

export const DEFAULT_MASK_THRESHOLD = 0.5;
export const DEFAULT_MASK_SMOOTH_N = 8;
/** Vertical pad ratios used during training (preprocess.crop_bbox). */
export const MASK_PAD = 0.2;
export const MASK_PAD_TOP_MULT = 0.65;
export const MASK_PAD_BOTTOM_MULT = 1.7;

// ─── Gaze ────────────────────────────────────────────────────────────────────

export type GazeRegion =
  | "top-left"
  | "top"
  | "top-right"
  | "left"
  | "center"
  | "right"
  | "bottom-left"
  | "bottom"
  | "bottom-right";

export type GazeResult = {
  /** Horizontal gaze, head-pose compensated. -1 (far left) .. 1 (far right). */
  x: number;
  /** Vertical gaze, head-pose compensated. -1 (up) .. 1 (down). */
  y: number;
  /** 3×3 screen region nearest to (x, y). */
  region: GazeRegion;
  /** Raw iris-in-eye ratio before head-pose compensation. */
  rawX: number;
  rawY: number;
  /** Approximate screen coordinates in [0, 1] (0,0 = top-left). */
  screen: { x: number; y: number };
  faceDetected: boolean;
};

/** MediaPipe refined-landmark indices for iris ring + center (5 each eye). */
export const LEFT_IRIS_IDX = [468, 469, 470, 471, 472] as const;
export const RIGHT_IRIS_IDX = [473, 474, 475, 476, 477] as const;
/** Eye corner / lid indices used to bound the iris position. */
export const LEFT_EYE_BOUNDS = {
  outer: 33,
  inner: 133,
  top: 159,
  bottom: 145,
} as const;
export const RIGHT_EYE_BOUNDS = {
  outer: 263,
  inner: 362,
  top: 386,
  bottom: 374,
} as const;

export const DEFAULT_GAZE_YAW_COMPENSATION = 0.012;
export const DEFAULT_GAZE_PITCH_COMPENSATION = 0.012;
export const DEFAULT_GAZE_DEADZONE = 0.18;
/** Flip gaze horizontally to match a mirrored (selfie) camera feed. */
export const DEFAULT_GAZE_MIRROR_X = true;
/** Flip gaze vertically. Rarely needed. */
export const DEFAULT_GAZE_MIRROR_Y = false;

/** One captured calibration point: raw iris ratio paired with target screen coords in [0, 1]. */
export type GazeCalibrationSample = {
  rawX: number;
  rawY: number;
  targetX: number; // 0 = left edge, 1 = right edge
  targetY: number; // 0 = top edge,  1 = bottom edge
};

/** 2×3 affine transform mapping raw gaze → screen coordinates. Stored row-major. */
export type GazeCalibration = {
  /** [a, b, c] such that screenX = a*rawX + b*rawY + c */
  xRow: [number, number, number];
  /** [d, e, f] such that screenY = d*rawX + e*rawY + f */
  yRow: [number, number, number];
  /** Number of samples used to fit. */
  sampleCount: number;
};

export const MIN_GAZE_CALIBRATION_SAMPLES = 3;

/** Least-squares affine fit. Returns null if matrix is singular or sample count < 3. */
export function fitGazeCalibration(
  samples: ArrayLike<GazeCalibrationSample>,
): GazeCalibration | null {
  const n = samples.length;
  if (n < MIN_GAZE_CALIBRATION_SAMPLES) return null;

  // Build 3×3 normal-equation matrix M = Aᵀ·A and 3×2 RHS B = Aᵀ·[targetX, targetY]
  // where each row of A is [rawX, rawY, 1].
  let m00 = 0,
    m01 = 0,
    m02 = 0,
    m11 = 0,
    m12 = 0,
    m22 = 0;
  let bx0 = 0,
    bx1 = 0,
    bx2 = 0;
  let by0 = 0,
    by1 = 0,
    by2 = 0;
  for (let i = 0; i < n; i++) {
    const s = samples[i];
    const rx = s.rawX;
    const ry = s.rawY;
    m00 += rx * rx;
    m01 += rx * ry;
    m02 += rx;
    m11 += ry * ry;
    m12 += ry;
    m22 += 1;
    bx0 += rx * s.targetX;
    bx1 += ry * s.targetX;
    bx2 += s.targetX;
    by0 += rx * s.targetY;
    by1 += ry * s.targetY;
    by2 += s.targetY;
  }

  // Invert symmetric 3×3 via cofactor expansion.
  const c00 = m11 * m22 - m12 * m12;
  const c01 = m02 * m12 - m01 * m22;
  const c02 = m01 * m12 - m02 * m11;
  const det = m00 * c00 + m01 * c01 + m02 * c02;
  if (Math.abs(det) < 1e-9) return null;
  const inv = 1 / det;
  const i00 = c00 * inv;
  const i01 = c01 * inv;
  const i02 = c02 * inv;
  const i11 = (m00 * m22 - m02 * m02) * inv;
  const i12 = (m01 * m02 - m00 * m12) * inv;
  const i22 = (m00 * m11 - m01 * m01) * inv;

  const a = i00 * bx0 + i01 * bx1 + i02 * bx2;
  const b = i01 * bx0 + i11 * bx1 + i12 * bx2;
  const c = i02 * bx0 + i12 * bx1 + i22 * bx2;
  const d = i00 * by0 + i01 * by1 + i02 * by2;
  const e = i01 * by0 + i11 * by1 + i12 * by2;
  const f = i02 * by0 + i12 * by1 + i22 * by2;

  return {
    xRow: [a, b, c],
    yRow: [d, e, f],
    sampleCount: n,
  };
}

export function applyGazeCalibration(
  cal: GazeCalibration,
  rawX: number,
  rawY: number,
): { x: number; y: number } {
  const [a, b, c] = cal.xRow;
  const [d, e, f] = cal.yRow;
  return {
    x: a * rawX + b * rawY + c,
    y: d * rawX + e * rawY + f,
  };
}

export function gazeRegion(x: number, y: number, deadzone: number): GazeRegion {
  const col = x < -deadzone ? "left" : x > deadzone ? "right" : "center";
  const row = y < -deadzone ? "top" : y > deadzone ? "bottom" : "center";
  if (row === "center" && col === "center") return "center";
  if (row === "center") return col as GazeRegion;
  if (col === "center") return row as GazeRegion;
  return `${row}-${col}` as GazeRegion;
}

export function softmax(logits: ArrayLike<number>): number[] {
  let max = -Infinity;
  for (let i = 0; i < logits.length; i++) if (logits[i] > max) max = logits[i];
  const exps: number[] = [];
  let sum = 0;
  for (let i = 0; i < logits.length; i++) {
    const e = Math.exp(logits[i] - max);
    exps.push(e);
    sum += e;
  }
  for (let i = 0; i < exps.length; i++) exps[i] /= sum;
  return exps;
}

export function argmax(values: ArrayLike<number>): number {
  let bestIdx = 0;
  let best = -Infinity;
  for (let i = 0; i < values.length; i++) {
    if (values[i] > best) {
      best = values[i];
      bestIdx = i;
    }
  }
  return bestIdx;
}

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
