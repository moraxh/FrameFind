import { useEffect, useRef, useState, useCallback } from "react";
import { GlassesDetector } from "@framefind/core";
import type { DetectionResult } from "@framefind/utils";

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
};

export type UseGlassesDetectorResult = {
  result: DetectionResult | null;
  inferenceTime: number | null;
  loading: boolean;
  error: Error | null;
  detect: (
    video: HTMLVideoElement,
    offscreen: HTMLCanvasElement,
    landmarks?: Array<{ x: number; y: number; z: number }>,
  ) => Promise<void>;
  detectImage: (canvas: HTMLCanvasElement) => Promise<void>;
  reset: () => void;
};

export function useGlassesDetector(opts: UseGlassesDetectorOptions): UseGlassesDetectorResult {
  const detectorRef = useRef<GlassesDetector | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [inferenceTime, setInferenceTime] = useState<number | null>(null);
  const enabled = opts.enabled ?? true;

  useEffect(() => {
    if (!enabled) return;

    const detector = new GlassesDetector({
      modelUrl: opts.modelUrl,
      wasmPaths: opts.wasmPaths,
      threshold: opts.threshold,
      smoothingWindow: opts.smoothingWindow,
      inferenceIntervalMs: opts.inferenceIntervalMs,
      minFaceDetectionConfidence: opts.minFaceDetectionConfidence,
      minFacePresenceConfidence: opts.minFacePresenceConfidence,
      preferGpu: opts.preferGpu,
    });
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
    opts.modelUrl,
    opts.wasmPaths,
    opts.threshold,
    opts.smoothingWindow,
    opts.inferenceIntervalMs,
    opts.minFaceDetectionConfidence,
    opts.minFacePresenceConfidence,
    opts.preferGpu,
    enabled,
  ]);

  const detect = useCallback(
    async (
      video: HTMLVideoElement,
      offscreen: HTMLCanvasElement,
      landmarks?: Array<{ x: number; y: number; z: number }>,
    ) => {
      if (!detectorRef.current) return;
      try {
        const t0 = performance.now();
        const r = await detectorRef.current.detectFromVideoFrame(video, offscreen, landmarks);
        setInferenceTime(performance.now() - t0);
        setResult(r);
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
      }
    },
    [],
  );

  const detectImage = useCallback(async (canvas: HTMLCanvasElement) => {
    if (!detectorRef.current) return;
    try {
      const t0 = performance.now();
      const r = await detectorRef.current.detectFromCanvas(canvas);
      setInferenceTime(performance.now() - t0);
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    }
  }, []);

  const reset = useCallback(() => {
    detectorRef.current?.resetHistory();
    setResult(null);
    setInferenceTime(null);
  }, []);

  return { result, inferenceTime, loading, error, detect, detectImage, reset };
}
