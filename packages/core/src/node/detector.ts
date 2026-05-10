import {
	DEFAULT_SMOOTH_N,
	DEFAULT_THRESHOLD,
	type DetectionResult,
	EYE_REGION_IDX,
	imageDataToChwFloat32,
	ROI_SIZE,
	sigmoid,
	smoothAverage,
} from "@framefind/utils";
import { mkdir } from "fs/promises";
import type { InferenceSession } from "onnxruntime-node";
import { tmpdir } from "os";
import { join } from "path";

export type GlassesDetectorNodeOptions = {
	modelPath?: string;
	threshold?: number;
	smoothingWindow?: number;
	autoLandmarks?: boolean;
};

type LandmarkPoint = { x: number; y: number; z?: number };

interface FaceLandmarksDetector {
	estimateFaces(
		input: unknown,
		config?: { flipHorizontal?: boolean },
	): Promise<
		Array<{
			keypoints: Array<{ x: number; y: number; z?: number; name?: string }>;
		}>
	>;
}

export class GlassesDetectorNode {
	private session: InferenceSession | null = null;
	private landmarksDetector: FaceLandmarksDetector | null = null;
	private probHistory: number[] = [];
	private threshold: number;
	private smoothN: number;
	private modelPath: string;
	private autoLandmarks: boolean;

	constructor(opts: GlassesDetectorNodeOptions) {
		this.modelPath =
			opts.modelPath ??
			"https://cdn.framefind.moraxh.dev/models/glasses/v1/glasses.onnx";
		this.threshold = opts.threshold ?? DEFAULT_THRESHOLD;
		this.smoothN = opts.smoothingWindow ?? DEFAULT_SMOOTH_N;
		this.autoLandmarks = opts.autoLandmarks ?? true;
	}

	private async ensureLocalModel(modelPathOrUrl: string): Promise<string> {
		if (
			!modelPathOrUrl.startsWith("http://") &&
			!modelPathOrUrl.startsWith("https://")
		) {
			return modelPathOrUrl;
		}

		const cacheDir = join(tmpdir(), "framefind-models");
		await mkdir(cacheDir, { recursive: true });
		const cachePath = join(cacheDir, "glasses.onnx");

		try {
			const fs = await import("fs");
			fs.statSync(cachePath);
			return cachePath;
		} catch {
			const response = await fetch(modelPathOrUrl);
			if (!response.ok)
				throw new Error(`Failed to fetch model: ${response.statusText}`);
			const fs = await import("fs/promises");
			const buffer = await response.arrayBuffer();
			await fs.writeFile(cachePath, Buffer.from(buffer));
			return cachePath;
		}
	}

	private async tryInitLandmarks(): Promise<void> {
		try {
			const tf = await import("@tensorflow/tfjs-node" as string);
			const faceLandmarksDetection = await import(
				"@tensorflow-models/face-landmarks-detection" as string
			);
			await tf.ready();
			this.landmarksDetector = await faceLandmarksDetection.createDetector(
				faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
				{
					runtime: "tfjs",
					refineLandmarks: false,
					maxFaces: 1,
				},
			);
		} catch {
			// optional peer deps not installed — autoLandmarks disabled, falls back to center-crop
		}
	}

	async load(): Promise<void> {
		const localPath = await this.ensureLocalModel(this.modelPath);
		const ort = await import("onnxruntime-node");
		this.session = await ort.InferenceSession.create(localPath, {
			executionProviders: ["cpu"],
		});

		if (this.autoLandmarks) {
			await this.tryInitLandmarks();
		}
	}

	private extractEyeROI(
		landmarks: LandmarkPoint[],
		imgWidth: number,
		imgHeight: number,
	): { x: number; y: number; w: number; h: number } | null {
		const pts = EYE_REGION_IDX.filter((i) => i < landmarks.length).map(
			(i) => landmarks[i],
		);
		if (pts.length === 0) return null;
		const xs = pts.map((p) => p.x);
		const ys = pts.map((p) => p.y);
		const x0r = Math.min(...xs),
			x1r = Math.max(...xs);
		const y0r = Math.min(...ys),
			y1r = Math.max(...ys);
		const side = Math.max(x1r - x0r, y1r - y0r) * 1.25;
		const cx = (x0r + x1r) / 2,
			cy = (y0r + y1r) / 2;
		const x0 = Math.max(0, cx - side / 2);
		const y0 = Math.max(0, cy - side / 2);
		const x1 = Math.min(imgWidth, cx + side / 2);
		const y1 = Math.min(imgHeight, cy + side / 2);
		if (x1 <= x0 || y1 <= y0) return null;
		return {
			x: Math.round(x0),
			y: Math.round(y0),
			w: Math.round(x1 - x0),
			h: Math.round(y1 - y0),
		};
	}

	/**
	 * Detect glasses from a pre-cropped, resized RGB buffer.
	 * Expects: Uint8ClampedArray of RGBA pixels, ROI_SIZE×ROI_SIZE (112×112).
	 */
	async detectFromRgbaBuffer(
		pixels: Uint8ClampedArray | Uint8Array,
		faceDetected = true,
	): Promise<DetectionResult> {
		if (!this.session) throw new Error("Call load() first");

		const clamped =
			pixels instanceof Uint8ClampedArray
				? pixels
				: new Uint8ClampedArray(pixels.buffer);
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
	 * Optionally uses @tensorflow-models/face-landmarks-detection + @tensorflow/tfjs-node for
	 * accurate eye ROI extraction when autoLandmarks is enabled.
	 */
	async detectFromImagePath(imagePath: string): Promise<DetectionResult> {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let sharp: any;
		try {
			sharp = (await import("sharp" as string)).default;
		} catch {
			throw new Error(
				"Install 'sharp' to use detectFromImagePath: npm i sharp",
			);
		}

		if (this.landmarksDetector) {
			return this.detectWithLandmarks(imagePath, sharp);
		}

		const { data } = await sharp(imagePath)
			.resize(ROI_SIZE, ROI_SIZE, { fit: "cover" })
			.toFormat("raw")
			.toBuffer({ resolveWithObject: true });

		const rgba = rgbToRgba(data as Buffer, ROI_SIZE, ROI_SIZE);
		return this.detectFromRgbaBuffer(rgba, false);
	}

	private async detectWithLandmarks(
		imagePath: string,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		sharp: any,
	): Promise<DetectionResult> {
		const meta = await sharp(imagePath).metadata();
		const imgWidth: number = meta.width ?? 0;
		const imgHeight: number = meta.height ?? 0;

		const { data: rawFull } = await sharp(imagePath)
			.toFormat("raw")
			.toBuffer({ resolveWithObject: true });

		// TF face-landmarks-detection expects a tensor3d [H, W, 3]
		const tf = await import("@tensorflow/tfjs-node" as string);
		const imageTensor = tf.tensor3d(
			new Uint8Array(rawFull.buffer as ArrayBuffer),
			[imgHeight, imgWidth, 3],
		);

		const faces = await this.landmarksDetector!.estimateFaces(imageTensor, {
			flipHorizontal: false,
		});
		imageTensor.dispose();

		if (!faces.length || !faces[0].keypoints?.length) {
			const { data } = await sharp(imagePath)
				.resize(ROI_SIZE, ROI_SIZE, { fit: "cover" })
				.toFormat("raw")
				.toBuffer({ resolveWithObject: true });
			const rgba = rgbToRgba(data as Buffer, ROI_SIZE, ROI_SIZE);
			return this.detectFromRgbaBuffer(rgba, false);
		}

		const landmarks = faces[0].keypoints as LandmarkPoint[];
		const roi = this.extractEyeROI(landmarks, imgWidth, imgHeight);

		if (!roi) {
			const { data } = await sharp(imagePath)
				.resize(ROI_SIZE, ROI_SIZE, { fit: "cover" })
				.toFormat("raw")
				.toBuffer({ resolveWithObject: true });
			const rgba = rgbToRgba(data as Buffer, ROI_SIZE, ROI_SIZE);
			return this.detectFromRgbaBuffer(rgba, false);
		}

		const { data: roiData } = await sharp(imagePath)
			.extract({ left: roi.x, top: roi.y, width: roi.w, height: roi.h })
			.resize(ROI_SIZE, ROI_SIZE, { fit: "fill" })
			.toFormat("raw")
			.toBuffer({ resolveWithObject: true });

		const rgba = rgbToRgba(roiData as Buffer, ROI_SIZE, ROI_SIZE);
		return this.detectFromRgbaBuffer(rgba, true);
	}

	resetHistory(): void {
		this.probHistory = [];
	}

	async dispose(): Promise<void> {
		await this.session?.release();
		this.session = null;
		this.landmarksDetector = null;
		this.probHistory = [];
	}
}

function rgbToRgba(
	buf: Buffer,
	width: number,
	height: number,
): Uint8ClampedArray {
	const rgba = new Uint8ClampedArray(width * height * 4);
	for (let i = 0; i < width * height; i++) {
		rgba[i * 4] = buf[i * 3];
		rgba[i * 4 + 1] = buf[i * 3 + 1];
		rgba[i * 4 + 2] = buf[i * 3 + 2];
		rgba[i * 4 + 3] = 255;
	}
	return rgba;
}
