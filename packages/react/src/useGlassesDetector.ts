import { GlassesDetector } from "@framefind/core";
import type { DetectionResult } from "@framefind/utils";
import {
	type RefObject,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { useVideoFrameDetect } from "./useVideoFrameDetect.js";

export type UseGlassesDetectorOptions = {
	modelUrl?: string;
	wasmPaths?: string;
	threshold?: number;
	smoothingWindow?: number;
	enabled?: boolean;
	inferenceIntervalMs?: number;
	minFaceDetectionConfidence?: number;
	minFacePresenceConfidence?: number;
	preferGpu?: boolean;

	/**
	 * Limit React rerenders from continuous inference.
	 * Default: 0 (no throttle, update every frame)
	 */
	uiUpdateIntervalMs?: number;
};

export type UseGlassesDetectorResult = {
	videoRef: RefObject<HTMLVideoElement | null>;

	result: DetectionResult | null;
	inferenceTime: number | null;

	loading: boolean;
	error: Error | null;

	isPaused: boolean;

	detectImage: (canvas: HTMLCanvasElement) => Promise<void>;

	pause: () => void;
	resume: () => void;

	reset: () => void;
};

export function useGlassesDetector(
	opts: UseGlassesDetectorOptions = {},
): UseGlassesDetectorResult {
	const {
		modelUrl,
		wasmPaths,
		threshold,
		smoothingWindow,
		enabled = true,
		inferenceIntervalMs,
		minFaceDetectionConfidence,
		minFacePresenceConfidence,
		preferGpu,
		uiUpdateIntervalMs = 0,
	} = opts;

	const videoRef = useRef<HTMLVideoElement | null>(null);

	const detectorRef = useRef<GlassesDetector | null>(null);

	const offscreenRef = useRef<HTMLCanvasElement | null>(null);

	const lastUiUpdateRef = useRef(0);

	const [loading, setLoading] = useState(false);

	const [error, setError] = useState<Error | null>(null);

	const [result, setResult] = useState<DetectionResult | null>(null);

	const [inferenceTime, setInferenceTime] = useState<number | null>(null);

	const [isPaused, setIsPaused] = useState(false);

	/**
	 * Initialize detector
	 */
	useEffect(() => {
		if (!enabled) return;

		const detector = new GlassesDetector({
			modelUrl,
			wasmPaths,
			threshold,
			smoothingWindow,
			inferenceIntervalMs,
			minFaceDetectionConfidence,
			minFacePresenceConfidence,
			preferGpu,
		});

		detectorRef.current = detector;

		setLoading(true);
		setError(null);

		detector
			.load()
			.then(() => {
				setLoading(false);
			})
			.catch((e) => {
				setError(e instanceof Error ? e : new Error(String(e)));

				setLoading(false);
			});

		return () => {
			detector.dispose();

			detectorRef.current = null;
		};
	}, [
		enabled,
		modelUrl,
		wasmPaths,
		threshold,
		smoothingWindow,
		inferenceIntervalMs,
		minFaceDetectionConfidence,
		minFacePresenceConfidence,
		preferGpu,
	]);

	/**
	 * Initialize offscreen canvas
	 */
	useEffect(() => {
		offscreenRef.current = document.createElement("canvas");

		return () => {
			offscreenRef.current = null;
		};
	}, []);

	const detect = useCallback(
		async (video: HTMLVideoElement) => {
			const detector = detectorRef.current;

			const offscreen = offscreenRef.current;

			if (!detector || !offscreen) return;

			const t0 = performance.now();

			const detection = await detector.detectFromVideoFrame(video, offscreen);

			const elapsed = performance.now() - t0;

			const now = performance.now();

			if (now - lastUiUpdateRef.current >= uiUpdateIntervalMs) {
				setResult(detection);

				setInferenceTime(elapsed);

				lastUiUpdateRef.current = now;
			}
		},
		[uiUpdateIntervalMs],
	);

	useVideoFrameDetect(videoRef.current, detect, {
		enabled: enabled && !loading,
		paused: isPaused,
	});

	/**
	 * Detect from static image
	 */
	const detectImage = useCallback(async (canvas: HTMLCanvasElement) => {
		if (!detectorRef.current) return;

		try {
			const t0 = performance.now();

			const detection = await detectorRef.current.detectFromCanvas(canvas);

			setInferenceTime(performance.now() - t0);

			setResult(detection);
		} catch (e) {
			setError(e instanceof Error ? e : new Error(String(e)));
		}
	}, []);

	const pause = useCallback(() => {
		setIsPaused(true);
	}, []);

	const resume = useCallback(() => {
		setIsPaused(false);
	}, []);

	const reset = useCallback(() => {
		detectorRef.current?.resetHistory();

		setResult(null);

		setInferenceTime(null);
	}, []);

	return {
		videoRef,
		result,
		inferenceTime,
		loading,
		error,
		isPaused,
		detectImage,
		pause,
		resume,
		reset,
	};
}
