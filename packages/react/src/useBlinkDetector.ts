import {
	BlinkDetector,
	type BlinkDetectorOptions,
	type BlinkResult,
} from "@framefind/core";
import {
	type RefObject,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { useVideoFrameDetect } from "./useVideoFrameDetect.js";

export type UseBlinkDetectorOptions = BlinkDetectorOptions & {
	enabled?: boolean;

	/**
	 * Limit React rerenders from continuous detection.
	 * Default: 0 (no throttle, update every frame)
	 */
	uiUpdateIntervalMs?: number;

	onBlink?: (result: {
		ear: number | null;
		leftEar: number | null;
		rightEar: number | null;
	}) => void;

	/**
	 * Provide an existing ref to share a single <video> element across multiple hooks.
	 * When omitted the hook creates its own ref.
	 */
	videoRef?: RefObject<HTMLVideoElement | null>;
};

export type UseBlinkDetectorResult = {
	videoRef: RefObject<HTMLVideoElement | null>;

	result: BlinkResult | null;

	inferenceTime: number | null;

	loading: boolean;

	error: Error | null;

	isPaused: boolean;

	pause: () => void;

	resume: () => void;

	reset: () => void;
};

export function useBlinkDetector(
	opts: UseBlinkDetectorOptions = {},
): UseBlinkDetectorResult {
	const {
		enabled = true,
		uiUpdateIntervalMs = 0,
		onBlink,

		faceLandmarkerModelUrl,
		mediapipeWasmPath,
		preferGpu,
		minFaceDetectionConfidence,
		minFacePresenceConfidence,
		minTrackingConfidence,
		videoRef: externalVideoRef,
	} = opts;

	const internalVideoRef = useRef<HTMLVideoElement | null>(null);
	const videoRef = externalVideoRef ?? internalVideoRef;

	const detectorRef = useRef<BlinkDetector | null>(null);

	const lastUiUpdateRef = useRef(0);

	const onBlinkRef = useRef(onBlink);

	onBlinkRef.current = onBlink;

	const [loading, setLoading] = useState(false);

	const [error, setError] = useState<Error | null>(null);

	const [result, setResult] = useState<BlinkResult | null>(null);

	const [inferenceTime, setInferenceTime] = useState<number | null>(null);

	const [isPaused, setIsPaused] = useState(false);

	/**
	 * Initialize detector
	 */
	useEffect(() => {
		if (!enabled) return;

		const detector = new BlinkDetector({
			faceLandmarkerModelUrl,
			mediapipeWasmPath,
			preferGpu,
			minFaceDetectionConfidence,
			minFacePresenceConfidence,
			minTrackingConfidence,
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
		faceLandmarkerModelUrl,
		mediapipeWasmPath,
		preferGpu,
		minFaceDetectionConfidence,
		minFacePresenceConfidence,
		minTrackingConfidence,
	]);

	const detect = useCallback(
		(video: HTMLVideoElement) => {
			const detector = detectorRef.current;

			if (!detector) return;

			const t0 = performance.now();

			const detection = detector.detectFromVideo(video);

			const elapsed = performance.now() - t0;

			const now = performance.now();

			if (now - lastUiUpdateRef.current >= uiUpdateIntervalMs) {
				setResult(detection);

				setInferenceTime(elapsed);

				lastUiUpdateRef.current = now;
			}

			if (detection.blinkDetected) {
				onBlinkRef.current?.({
					ear: detection.ear,
					leftEar: detection.leftEar,
					rightEar: detection.rightEar,
				});
			}
		},
		[uiUpdateIntervalMs],
	);

	useVideoFrameDetect(videoRef.current, detect, {
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
		pause,
		resume,
		reset,
	};
}
