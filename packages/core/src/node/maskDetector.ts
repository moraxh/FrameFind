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
import { mkdir } from "fs/promises";
import type { InferenceSession } from "onnxruntime-node";
import { tmpdir } from "os";
import { join } from "path";

export type MaskDetectorNodeOptions = {
	modelPath?: string;
	threshold?: number;
	smoothingWindow?: number;
	autoLandmarks?: boolean;
};

type LandmarkPoint = { x: number; y: number; z?: number };
type Roi = { x: number; y: number; w: number; h: number };

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

const EMPTY_RESULT: MaskDetectionResult = {
	label: "without_mask",
	probability: 0,
	probabilities: [0, 0, 0],
	mask: false,
	faceDetected: false,
};

export class MaskDetectorNode {
	private session: InferenceSession | null = null;
	private landmarksDetector: FaceLandmarksDetector | null = null;
	private probHistory: Array<[number, number, number]> = [];
	private threshold: number;
	private smoothN: number;
	private modelPath: string;
	private autoLandmarks: boolean;

	constructor(opts: MaskDetectorNodeOptions) {
		this.modelPath =
			opts.modelPath ??
			"https://cdn.framefind.moraxh.dev/models/mask/v1/mask.onnx";
		this.threshold = opts.threshold ?? DEFAULT_MASK_THRESHOLD;
		this.smoothN = opts.smoothingWindow ?? DEFAULT_MASK_SMOOTH_N;
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
		const cachePath = join(cacheDir, "mask.onnx");

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
			// optional peer deps not installed
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

	private extractFaceROI(
		landmarks: LandmarkPoint[],
		imgWidth: number,
		imgHeight: number,
	): Roi | null {
		if (!landmarks.length) return null;
		let xMin = Infinity,
			yMin = Infinity,
			xMax = -Infinity,
			yMax = -Infinity;
		for (const p of landmarks) {
			if (p.x < xMin) xMin = p.x;
			if (p.y < yMin) yMin = p.y;
			if (p.x > xMax) xMax = p.x;
			if (p.y > yMax) yMax = p.y;
		}
		const bw = xMax - xMin;
		const bh = yMax - yMin;
		if (bw <= 0 || bh <= 0) return null;
		const padX = bw * MASK_PAD;
		const padTop = bh * MASK_PAD * MASK_PAD_TOP_MULT;
		const padBottom = bh * MASK_PAD * MASK_PAD_BOTTOM_MULT;
		const x0 = Math.max(0, xMin - padX);
		const y0 = Math.max(0, yMin - padTop);
		const x1 = Math.min(imgWidth, xMax + padX);
		const y1 = Math.min(imgHeight, yMax + padBottom);
		if (x1 <= x0 || y1 <= y0) return null;
		return {
			x: Math.round(x0),
			y: Math.round(y0),
			w: Math.round(x1 - x0),
			h: Math.round(y1 - y0),
		};
	}

	/**
	 * Detect mask from pre-cropped RGBA buffer of size ROI_SIZE×ROI_SIZE.
	 */
	async detectFromRgbaBuffer(
		pixels: Uint8ClampedArray | Uint8Array,
		faceDetected = true,
	): Promise<MaskDetectionResult> {
		if (!this.session) throw new Error("Call load() first");

		const clamped =
			pixels instanceof Uint8ClampedArray
				? pixels
				: new Uint8ClampedArray(pixels.buffer);
		const tensor = imageDataToChwFloat32(clamped, ROI_SIZE, ROI_SIZE);

		const ort = await import("onnxruntime-node");
		const input = new ort.Tensor("float32", tensor, [1, 3, ROI_SIZE, ROI_SIZE]);
		const out = await this.session.run({ input });
		const logits = out["logits"].data as Float32Array;
		const probs = softmax(logits);
		const triple: [number, number, number] = [probs[0], probs[1], probs[2]];

		this.probHistory.push(triple);
		if (this.probHistory.length > this.smoothN) this.probHistory.shift();

		const smoothed = averageTriple(this.probHistory);
		return this.buildResult(smoothed, faceDetected);
	}

	async detectFromImagePath(imagePath: string): Promise<MaskDetectionResult> {
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
	): Promise<MaskDetectionResult> {
		const meta = await sharp(imagePath).metadata();
		const imgWidth: number = meta.width ?? 0;
		const imgHeight: number = meta.height ?? 0;

		const { data: rawFull } = await sharp(imagePath)
			.toFormat("raw")
			.toBuffer({ resolveWithObject: true });

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
		const roi = this.extractFaceROI(landmarks, imgWidth, imgHeight);

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
