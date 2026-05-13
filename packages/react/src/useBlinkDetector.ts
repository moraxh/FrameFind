import {
  BlinkDetector,
  type BlinkDetectorOptions,
  type Point2D,
} from "@framefind/core";
import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useVideoFrameDetect } from "./useVideoFrameDetect.js";

export type BlinkStateResult = {
  faceDetected: boolean;
  isBlinking: boolean;
  /** Milliseconds eyes have been continuously closed. 0 when open. */
  blinkDurationMs: number;
  ear: number | null;
  baselineEar: number | null;
  smoothedEar: number | null;
  landmarks: Point2D[] | null;
};

export type UseBlinkDetectorOptions = Omit<
  BlinkDetectorOptions,
  "onBlink" | "onEARChange" | "onLandmarks" | "onFaceLost"
> & {
  enabled?: boolean;

  /**
   * Limit React rerenders from continuous detection.
   * Default: 0 (no throttle, update every frame)
   */
  uiUpdateIntervalMs?: number;

  /** Fires when blink/closure detected. `ear` is the minimum EAR at trigger. */
  onBlink?: (ear: number) => void;

  /** Fires when face is lost for sustained period. */
  onFaceLost?: () => void;

  /** Fires every frame with smoothed average EAR. */
  onEARChange?: (ear: number) => void;

  /** Fires every frame with raw landmarks (null when face missing). */
  onLandmarks?: (landmarks: Point2D[] | null) => void;

  /**
   * Provide an existing ref to share a single <video> element across multiple hooks.
   * When omitted the hook creates its own ref.
   */
  videoRef?: RefObject<HTMLVideoElement | null>;
};

export type UseBlinkDetectorResult = {
  videoRef: RefObject<HTMLVideoElement | null>;

  result: BlinkStateResult;

  inferenceTime: number | null;

  loading: boolean;

  error: Error | null;

  isPaused: boolean;

  pause: () => void;

  resume: () => void;

  reset: () => void;
};

const EMPTY_STATE: BlinkStateResult = {
  faceDetected: false,
  isBlinking: false,
  blinkDurationMs: 0,
  ear: null,
  baselineEar: null,
  smoothedEar: null,
  landmarks: null,
};

export function useBlinkDetector(
  opts: UseBlinkDetectorOptions = {},
): UseBlinkDetectorResult {
  const {
    enabled = true,
    uiUpdateIntervalMs = 0,
    onBlink,
    onFaceLost,
    onEARChange,
    onLandmarks,
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
  const isLoadedRef = useRef(false);
  const lastUiUpdateRef = useRef(0);

  const onBlinkRef = useRef(onBlink);
  const onFaceLostRef = useRef(onFaceLost);
  const onEARChangeRef = useRef(onEARChange);
  const onLandmarksRef = useRef(onLandmarks);
  onBlinkRef.current = onBlink;
  onFaceLostRef.current = onFaceLost;
  onEARChangeRef.current = onEARChange;
  onLandmarksRef.current = onLandmarks;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [result, setResult] = useState<BlinkStateResult>(EMPTY_STATE);
  const [inferenceTime, setInferenceTime] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  const latestLandmarksRef = useRef<Point2D[] | null>(null);
  const latestEarRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const detector = new BlinkDetector({
      faceLandmarkerModelUrl,
      mediapipeWasmPath,
      preferGpu,
      minFaceDetectionConfidence,
      minFacePresenceConfidence,
      minTrackingConfidence,
      onBlink: (ear) => onBlinkRef.current?.(ear),
      onFaceLost: () => onFaceLostRef.current?.(),
      onEARChange: (ear) => {
        latestEarRef.current = ear;
        onEARChangeRef.current?.(ear);
      },
      onLandmarks: (lm) => {
        latestLandmarksRef.current = lm;
        onLandmarksRef.current?.(lm);
      },
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
    faceLandmarkerModelUrl,
    mediapipeWasmPath,
    preferGpu,
    minFaceDetectionConfidence,
    minFacePresenceConfidence,
    minTrackingConfidence,
  ]);

  const resultRef = useRef<BlinkStateResult>(EMPTY_STATE);

  const detect = useCallback(
    (video: HTMLVideoElement) => {
      const detector = detectorRef.current;
      if (!detector || !isLoadedRef.current) return;

      const t0 = performance.now();
      detector.processFrame(video);
      const elapsed = performance.now() - t0;
      const now = performance.now();

      if (now - lastUiUpdateRef.current >= uiUpdateIntervalMs) {
        const lm = latestLandmarksRef.current;
        const faceDetected = lm !== null;
        const isBlinking = detector.isBlinking;
        const blinkDurationMs = detector.blinkDurationMs;
        const ear = latestEarRef.current;
        const baselineEar = detector.baselineEarValue;
        const smoothedEar = detector.smoothedEarValue;
        const prev = resultRef.current;
        const changed =
          prev.faceDetected !== faceDetected ||
          prev.isBlinking !== isBlinking ||
          prev.blinkDurationMs !== blinkDurationMs ||
          prev.ear !== ear ||
          prev.baselineEar !== baselineEar ||
          prev.smoothedEar !== smoothedEar ||
          prev.landmarks !== lm;
        if (changed) {
          const next = { faceDetected, isBlinking, blinkDurationMs, ear, baselineEar, smoothedEar, landmarks: lm };
          resultRef.current = next;
          setResult(next);
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
    detectorRef.current?.resetHistory();
    latestLandmarksRef.current = null;
    latestEarRef.current = null;
    setResult(EMPTY_STATE);
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
