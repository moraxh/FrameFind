import { useEffect, useRef, useState, useCallback } from "react";
import { HeadPoseDetector, HeadPoseDetectorWorker, type HeadPoseSmoothing } from "@framefind/core";
import type { HeadPoseResult } from "@framefind/utils";

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
};

export type UseHeadPoseDetectorResult = {
  result: HeadPoseResult | null;
  inferenceTime: number | null;
  loading: boolean;
  error: Error | null;
  detect: (video: HTMLVideoElement) => void;
  reset: () => void;
};

type AnyDetector = HeadPoseDetector | HeadPoseDetectorWorker;

export function useHeadPoseDetector(opts: UseHeadPoseDetectorOptions = {}): UseHeadPoseDetectorResult {
  const detectorRef = useRef<AnyDetector | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [result, setResult] = useState<HeadPoseResult | null>(null);
  const [inferenceTime, setInferenceTime] = useState<number | null>(null);
  const enabled = opts.enabled ?? true;
  const useWorker = opts.useWorker ?? false;

  useEffect(() => {
    if (!enabled) return;

    const ctorOpts = {
      alpha: opts.alpha,
      smoothing: opts.smoothing,
      faceLandmarkerModelUrl: opts.faceLandmarkerModelUrl,
      mediapipeWasmPath: opts.mediapipeWasmPath,
      inferenceIntervalMs: opts.inferenceIntervalMs,
      minFaceDetectionConfidence: opts.minFaceDetectionConfidence,
      minFacePresenceConfidence: opts.minFacePresenceConfidence,
      minTrackingConfidence: opts.minTrackingConfidence,
      preferGpu: opts.preferGpu,
    };
    const detector: AnyDetector = useWorker
      ? new HeadPoseDetectorWorker(ctorOpts)
      : new HeadPoseDetector(ctorOpts);
    detectorRef.current = detector;
    setLoading(true);
    setError(null);

    detector
      .load()
      .then(() => setLoading(false))
      .catch(e => {
        setError(e instanceof Error ? e : new Error(String(e)));
        setLoading(false);
      });

    return () => {
      detector.dispose();
      detectorRef.current = null;
    };
  }, [
    opts.alpha,
    opts.smoothing,
    opts.faceLandmarkerModelUrl,
    opts.mediapipeWasmPath,
    opts.inferenceIntervalMs,
    opts.minFaceDetectionConfidence,
    opts.minFacePresenceConfidence,
    opts.minTrackingConfidence,
    opts.preferGpu,
    useWorker,
    enabled,
  ]);

  const detect = useCallback((video: HTMLVideoElement) => {
    const det = detectorRef.current;
    if (!det) return;
    const t0 = performance.now();
    try {
      const out = det.detectFromVideo(video);
      if (out instanceof Promise) {
        out
          .then(r => {
            setInferenceTime(performance.now() - t0);
            setResult(r);
          })
          .catch(e => setError(e instanceof Error ? e : new Error(String(e))));
      } else {
        setInferenceTime(performance.now() - t0);
        setResult(out);
      }
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    }
  }, []);

  const reset = useCallback(() => {
    detectorRef.current?.resetSmoothing();
    setResult(null);
    setInferenceTime(null);
  }, []);

  return { result, inferenceTime, loading, error, detect, reset };
}
