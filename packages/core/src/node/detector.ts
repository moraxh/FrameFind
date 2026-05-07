import type { InferenceSession } from "onnxruntime-node";
import {
  type DetectionResult,
  DEFAULT_THRESHOLD,
  DEFAULT_SMOOTH_N,
  ROI_SIZE,
  sigmoid,
  smoothAverage,
  imageDataToChwFloat32,
} from "@framefind/utils";

export type GlassesDetectorNodeOptions = {
  modelPath: string;
  threshold?: number;
  smoothingWindow?: number;
};

export class GlassesDetectorNode {
  private session: InferenceSession | null = null;
  private probHistory: number[] = [];
  private threshold: number;
  private smoothN: number;
  private modelPath: string;

  constructor(opts: GlassesDetectorNodeOptions) {
    this.modelPath = opts.modelPath;
    this.threshold = opts.threshold ?? DEFAULT_THRESHOLD;
    this.smoothN = opts.smoothingWindow ?? DEFAULT_SMOOTH_N;
  }

  async load(): Promise<void> {
    const ort = await import("onnxruntime-node");
    this.session = await ort.InferenceSession.create(this.modelPath, {
      executionProviders: ["cpu"],
    });
  }

  /**
   * Detect glasses from a pre-cropped, resized RGB buffer.
   * Expects: Uint8ClampedArray of RGBA pixels, ROI_SIZE×ROI_SIZE (112×112).
   * Use the sharp/canvas ecosystem to produce this buffer.
   */
  async detectFromRgbaBuffer(
    pixels: Uint8ClampedArray | Uint8Array,
    faceDetected = true,
  ): Promise<DetectionResult> {
    if (!this.session) throw new Error("Call load() first");

    const clamped =
      pixels instanceof Uint8ClampedArray ? pixels : new Uint8ClampedArray(pixels.buffer);
    const tensor = imageDataToChwFloat32(clamped, ROI_SIZE, ROI_SIZE);

    const ort = await import("onnxruntime-node");
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

  /**
   * Detect from a raw image file path.
   * Requires `sharp` installed by the caller: npm i sharp
   */
  async detectFromImagePath(imagePath: string): Promise<DetectionResult> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let sharp: any;
    try {
      sharp = (await import("sharp" as string)).default;
    } catch {
      throw new Error("Install 'sharp' to use detectFromImagePath: npm i sharp");
    }

    // sharp raw output = RGB (3 channels), no alpha
    const { data } = await sharp(imagePath)
      .resize(ROI_SIZE, ROI_SIZE, { fit: "cover" })
      .toFormat("raw")
      .toBuffer({ resolveWithObject: true });

    const rgba = new Uint8ClampedArray(ROI_SIZE * ROI_SIZE * 4);
    for (let i = 0; i < ROI_SIZE * ROI_SIZE; i++) {
      rgba[i * 4]     = (data as Buffer)[i * 3];
      rgba[i * 4 + 1] = (data as Buffer)[i * 3 + 1];
      rgba[i * 4 + 2] = (data as Buffer)[i * 3 + 2];
      rgba[i * 4 + 3] = 255;
    }
    return this.detectFromRgbaBuffer(rgba);
  }

  resetHistory(): void {
    this.probHistory = [];
  }

  async dispose(): Promise<void> {
    await this.session?.release();
    this.session = null;
    this.probHistory = [];
  }
}
