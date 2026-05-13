import {
	HeadPoseDetector,
	HeadPoseDetectorWorker,
	type HeadPoseSmoothing,
} from "@framefind/core";
import type { HeadPoseResult } from "@framefind/utils";
import {
	type RefObject,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { useVideoFrameDetect } from "./useVideoFrameDetect.js";

export type UseHeadPoseDetectorOptions = {
	alpha?: number;

	smoothing?: HeadPoseSmoothing;

	faceLandmarkerModelUrl?: string;

	mediapipeWasmPath?: string;

	enabled?: boolean;

	inferenceIntervalMs?: number;

	minFaceDetectionConfidence?: number;

	minFacePresenceConfidence?: number;

	minTrackingConfidence?: number;

	preferGpu?: boolean;

	useWorker?: boolean;

	/**
	 * Limit React rerenders from continuous detection.
	 * Default: 0 (no throttle, update every frame)
	 */
	uiUpdateIntervalMs?: number;

	/**
	 * Provide an existing ref to share a single <video> element across multiple hooks.
	 * When omitted the hook creates its own ref.
	 */
	videoRef?: RefObject<HTMLVideoElement | null>;
};

export type UseHeadPoseDetectorResult = {
	videoRef: RefObject<HTMLVideoElement | null>;

	result: HeadPoseResult | null;

	inferenceTime: number | null;

	loading: boolean;

	error: Error | null;

	isPaused: boolean;

	pause: () => void;

	resume: () => void;

	reset: () => void;
};

type AnyDetector = HeadPoseDetector | HeadPoseDetectorWorker;

export function useHeadPoseDetector(
	opts: UseHeadPoseDetectorOptions = {},
): UseHeadPoseDetectorResult {
	const {
		alpha,
		smoothing,
		faceLandmarkerModelUrl,
		mediapipeWasmPath,
		enabled = true,
		inferenceIntervalMs,
		minFaceDetectionConfidence,
		minFacePresenceConfidence,
		minTrackingConfidence,
		preferGpu,
		useWorker = false,
		uiUpdateIntervalMs = 0,
		videoRef: externalVideoRef,
	} = opts;

	const internalVideoRef = useRef<HTMLVideoElement | null>(null);
	const videoRef = externalVideoRef ?? internalVideoRef;

	const detectorRef = useRef<AnyDetector | null>(null);
	const isLoadedRef = useRef(false);

	const lastUiUpdateRef = useRef(0);

	const [loading, setLoading] = useState(false);

	const [error, setError] = useState<Error | null>(null);

	const [result, setResult] = useState<HeadPoseResult | null>(null);

	const [inferenceTime, setInferenceTime] = useState<number | null>(null);

	const [isPaused, setIsPaused] = useState(false);

	/**
	 * Initialize detector
	 */
	useEffect(() => {
		if (!enabled) return;

		const ctorOpts = {
			alpha,
			smoothing,
			faceLandmarkerModelUrl,
			mediapipeWasmPath,
			inferenceIntervalMs,
			minFaceDetectionConfidence,
			minFacePresenceConfidence,
			minTrackingConfidence,
			preferGpu,
		};

		const detector: AnyDetector = useWorker
			? new HeadPoseDetectorWorker(ctorOpts)
			: new HeadPoseDetector(ctorOpts);

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
		alpha,
		smoothing,
		faceLandmarkerModelUrl,
		mediapipeWasmPath,
		inferenceIntervalMs,
		minFaceDetectionConfidence,
		minFacePresenceConfidence,
		minTrackingConfidence,
		preferGpu,
		useWorker,
		enabled,
	]);

	const resultRef = useRef<HeadPoseResult | null>(null);

	const detect = useCallback(
		async (video: HTMLVideoElement) => {
			const detector = detectorRef.current;

			if (!detector || !isLoadedRef.current) return;

			const t0 = performance.now();

			const detection = await detector.detectFromVideo(video);

			const elapsed = performance.now() - t0;

			const now = performance.now();

			if (now - lastUiUpdateRef.current >= uiUpdateIntervalMs) {
				const prev = resultRef.current;
				const changed =
					prev === null ||
					prev.yaw !== detection.yaw ||
					prev.pitch !== detection.pitch ||
					prev.roll !== detection.roll ||
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

	const pause = useCallback(() => {
		setIsPaused(true);
	}, []);

	const resume = useCallback(() => {
		setIsPaused(false);
	}, []);

	const reset = useCallback(() => {
		detectorRef.current?.resetSmoothing();

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
		pause,
		resume,
		reset,
	};
}
