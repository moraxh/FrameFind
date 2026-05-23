import { GazeDetector, type GazeSmoothing } from "@framefind/core";
import type { GazeCalibration, GazeResult } from "@framefind/utils";
import {
	type RefObject,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { useVideoFrameDetect } from "./useVideoFrameDetect.js";

export type UseGazeDetectorOptions = {
	smoothing?: GazeSmoothing;
	faceLandmarkerModelUrl?: string;
	mediapipeWasmPath?: string;
	enabled?: boolean;
	inferenceIntervalMs?: number;
	minFaceDetectionConfidence?: number;
	minFacePresenceConfidence?: number;
	minTrackingConfidence?: number;
	preferGpu?: boolean;
	yawCompensation?: number;
	pitchCompensation?: number;
	deadzone?: number;
	mirrorX?: boolean;
	mirrorY?: boolean;
	uiUpdateIntervalMs?: number;
	videoRef?: RefObject<HTMLVideoElement | null>;
};

export type UseGazeDetectorResult = {
	videoRef: RefObject<HTMLVideoElement | null>;
	result: GazeResult | null;
	inferenceTime: number | null;
	loading: boolean;
	error: Error | null;
	isPaused: boolean;
	pause: () => void;
	resume: () => void;
	reset: () => void;

	/** Capture one calibration sample at the given screen target (each axis in [0, 1]). */
	addCalibrationSample: (targetX: number, targetY: number) => boolean;
	/** Fit the affine transform from collected samples. Returns null on failure. */
	calibrate: () => GazeCalibration | null;
	/** Inject a previously-saved calibration. */
	setCalibration: (cal: GazeCalibration | null) => void;
	/** Drop samples + active calibration. */
	clearCalibration: () => void;
	/** True once a calibration has been successfully fitted. */
	isCalibrated: boolean;
	/** Number of samples captured so far. */
	calibrationSampleCount: number;
};

export function useGazeDetector(
	opts: UseGazeDetectorOptions = {},
): UseGazeDetectorResult {
	const {
		smoothing,
		faceLandmarkerModelUrl,
		mediapipeWasmPath,
		enabled = true,
		inferenceIntervalMs,
		minFaceDetectionConfidence,
		minFacePresenceConfidence,
		minTrackingConfidence,
		preferGpu,
		yawCompensation,
		pitchCompensation,
		deadzone,
		mirrorX,
		mirrorY,
		uiUpdateIntervalMs = 0,
		videoRef: externalVideoRef,
	} = opts;

	const internalVideoRef = useRef<HTMLVideoElement | null>(null);
	const videoRef = externalVideoRef ?? internalVideoRef;

	const detectorRef = useRef<GazeDetector | null>(null);
	const isLoadedRef = useRef(false);
	const lastUiUpdateRef = useRef(0);

	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);
	const [result, setResult] = useState<GazeResult | null>(null);
	const [inferenceTime, setInferenceTime] = useState<number | null>(null);
	const [isPaused, setIsPaused] = useState(false);
	const [isCalibrated, setIsCalibrated] = useState(false);
	const [calibrationSampleCount, setCalibrationSampleCount] = useState(0);

	useEffect(() => {
		if (!enabled) return;

		const detector = new GazeDetector({
			smoothing,
			faceLandmarkerModelUrl,
			mediapipeWasmPath,
			inferenceIntervalMs,
			minFaceDetectionConfidence,
			minFacePresenceConfidence,
			minTrackingConfidence,
			preferGpu,
			yawCompensation,
			pitchCompensation,
			deadzone,
			mirrorX,
			mirrorY,
		});

		detectorRef.current = detector;
		isLoadedRef.current = false;

		setLoading(true);
		setError(null);
		setIsCalibrated(false);
		setCalibrationSampleCount(0);

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
		smoothing,
		faceLandmarkerModelUrl,
		mediapipeWasmPath,
		inferenceIntervalMs,
		minFaceDetectionConfidence,
		minFacePresenceConfidence,
		minTrackingConfidence,
		preferGpu,
		yawCompensation,
		pitchCompensation,
		deadzone,
		mirrorX,
		mirrorY,
	]);

	const resultRef = useRef<GazeResult | null>(null);

	const detect = useCallback(
		async (video: HTMLVideoElement) => {
			const detector = detectorRef.current;
			if (!detector || !isLoadedRef.current) return;

			const t0 = performance.now();
			const detection = detector.detectFromVideo(video);
			const elapsed = performance.now() - t0;

			const now = performance.now();
			if (now - lastUiUpdateRef.current >= uiUpdateIntervalMs) {
				const prev = resultRef.current;
				const changed =
					prev === null ||
					prev.x !== detection.x ||
					prev.y !== detection.y ||
					prev.region !== detection.region ||
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

	const pause = useCallback(() => setIsPaused(true), []);
	const resume = useCallback(() => setIsPaused(false), []);
	const reset = useCallback(() => {
		detectorRef.current?.resetSmoothing();
		setResult(null);
		setInferenceTime(null);
	}, []);

	const addCalibrationSample = useCallback(
		(targetX: number, targetY: number) => {
			const det = detectorRef.current;
			if (!det) return false;
			const ok = det.addCalibrationSample(targetX, targetY);
			if (ok) setCalibrationSampleCount(det.getCalibrationSampleCount());
			return ok;
		},
		[],
	);

	const calibrate = useCallback(() => {
		const det = detectorRef.current;
		if (!det) return null;
		const cal = det.calibrate();
		setIsCalibrated(cal !== null);
		return cal;
	}, []);

	const setCalibration = useCallback((cal: GazeCalibration | null) => {
		const det = detectorRef.current;
		if (!det) return;
		det.setCalibration(cal);
		setIsCalibrated(cal !== null);
	}, []);

	const clearCalibration = useCallback(() => {
		const det = detectorRef.current;
		if (!det) return;
		det.clearCalibration();
		setIsCalibrated(false);
		setCalibrationSampleCount(0);
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
		addCalibrationSample,
		calibrate,
		setCalibration,
		clearCalibration,
		isCalibrated,
		calibrationSampleCount,
	};
}
