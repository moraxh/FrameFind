import { useEffect, useRef, useState, useCallback } from "react";
import { BlinkDetector, type BlinkDetectorOptions, type BlinkResult } from "@framefind/core";

export type UseBlinkDetectorOptions = BlinkDetectorOptions & {
  enabled?: boolean;
  onBlink?: (result: { ear: number | null; leftEar: number | null; rightEar: number | null }) => void;
};

export type UseBlinkDetectorResult = {
  result: BlinkResult | null;
  inferenceTime: number | null;
  loading: boolean;
  error: Error | null;
  detect: (video: HTMLVideoElement) => void;
  reset: () => void;
};

export function useBlinkDetector(opts: UseBlinkDetectorOptions = {}): UseBlinkDetectorResult {
  const detectorRef = useRef<BlinkDetector | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [result, setResult] = useState<BlinkResult | null>(null);
  const [inferenceTime, setInferenceTime] = useState<number | null>(null);
  const enabled = opts.enabled ?? true;
  const onBlinkRef = useRef(opts.onBlink);
  onBlinkRef.current = opts.onBlink;

  useEffect(() => {
    if (!enabled) return;

    const detector = new BlinkDetector({
      faceLandmarkerModelUrl: opts.faceLandmarkerModelUrl,
      mediapipeWasmPath: opts.mediapipeWasmPath,
      preferGpu: opts.preferGpu,
      minFaceDetectionConfidence: opts.minFaceDetectionConfidence,
      minFacePresenceConfidence: opts.minFacePresenceConfidence,
      minTrackingConfidence: opts.minTrackingConfidence,
    });
    detectorRef.current = detector;
    setLoading(true);
    setError(null);

    detector
      .load()
      .then(() => setLoading(false))
      .catch((e) => {
        setError(e instanceof Error ? e : new Error(String(e)));
        setLoading(false);
      });

    return () => {
      detector.dispose();
      detectorRef.current = null;
    };
  }, [
    opts.faceLandmarkerModelUrl,
    opts.mediapipeWasmPath,
    opts.preferGpu,
    opts.minFaceDetectionConfidence,
    opts.minFacePresenceConfidence,
    opts.minTrackingConfidence,
    enabled,
  ]);

  const detect = useCallback((video: HTMLVideoElement) => {
    const det = detectorRef.current;
    if (!det) return;
    const t0 = performance.now();
    try {
      const r = det.detectFromVideo(video);
      setInferenceTime(performance.now() - t0);
      setResult(r);
      if (r.blinkDetected) onBlinkRef.current?.({ ear: r.ear, leftEar: r.leftEar, rightEar: r.rightEar });
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    }
  }, []);

  const reset = useCallback(() => {
    detectorRef.current?.resetHistory();
    setResult(null);
    setInferenceTime(null);
  }, []);

  return { result, inferenceTime, loading, error, detect, reset };
}
