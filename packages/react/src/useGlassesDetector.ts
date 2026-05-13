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

	/**
	 * Provide an existing ref to share a single <video> element across multiple hooks.
	 * When omitted the hook creates its own ref.
	 */
	videoRef?: RefObject<HTMLVideoElement | null>;
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
		videoRef: externalVideoRef,
	} = opts;

	const internalVideoRef = useRef<HTMLVideoElement | null>(null);
	const videoRef = externalVideoRef ?? internalVideoRef;

	const detectorRef = useRef<GlassesDetector | null>(null);
	const isLoadedRef = useRef(false);

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
		isLoadedRef.current = false;

		setLoading(true);
		setError(null);

		detector
			.load()
			.then(() => {
				isLoadedRef.current = true;
				setLoading(false);
			})
			.catch((e) => {
				setError(e instanceof Error ? e : new Error(String(e)));

				setLoading(false);
			});

		return () => {
			detector.dispose();

			detectorRef.current = null;
			isLoadedRef.current = false;
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

	const resultRef = useRef<DetectionResult | null>(null);

	const detect = useCallback(
		async (video: HTMLVideoElement) => {
			const detector = detectorRef.current;

			const offscreen = offscreenRef.current;

			if (!detector || !isLoadedRef.current || !offscreen) return;

			const t0 = performance.now();

			const detection = await detector.detectFromVideoFrame(video, offscreen);

			const elapsed = performance.now() - t0;

			const now = performance.now();

			if (now - lastUiUpdateRef.current >= uiUpdateIntervalMs) {
				const prev = resultRef.current;
				const changed =
					prev === null ||
					prev.glasses !== detection.glasses ||
					prev.probability !== detection.probability ||
					prev.faceDetected !== detection.faceDetected;
				if (changed) {
					resultRef.current = detection;
					setResult(detection);
					setInferenceTime(elapsed);
				}
				lastUiUpdateRef.current = now;
			}
		},
		[uiUpdateIntervalMs],
	);

	useVideoFrameDetect(videoRef, detect, {
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
