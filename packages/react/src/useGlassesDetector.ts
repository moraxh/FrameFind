import { useEffect, useRef, useState, useCallback } from "react";
import { GlassesDetector } from "@framefind/core";
import type { DetectionResult } from "@framefind/utils";

export type UseGlassesDetectorOptions = {
  modelUrl: string;
  wasmPaths?: string;
  threshold?: number;
  smoothingWindow?: number;
  enabled?: boolean;
};

export type UseGlassesDetectorResult = {
  result: DetectionResult | null;
  loading: boolean;
  error: Error | null;
  detect: (
    video: HTMLVideoElement,
    offscreen: HTMLCanvasElement,
    landmarks?: Array<{ x: number; y: number; z: number }>,
  ) => Promise<void>;
  reset: () => void;
};

export function useGlassesDetector(opts: UseGlassesDetectorOptions): UseGlassesDetectorResult {
  const detectorRef = useRef<GlassesDetector | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [result, setResult] = useState<DetectionResult | null>(null);
  const enabled = opts.enabled ?? true;

  useEffect(() => {
    if (!enabled) return;

    const detector = new GlassesDetector({
      modelUrl: opts.modelUrl,
      wasmPaths: opts.wasmPaths,
      threshold: opts.threshold,
      smoothingWindow: opts.smoothingWindow,
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
  }, [opts.modelUrl, opts.wasmPaths, opts.threshold, opts.smoothingWindow, enabled]);

  const detect = useCallback(
    async (
      video: HTMLVideoElement,
      offscreen: HTMLCanvasElement,
      landmarks?: Array<{ x: number; y: number; z: number }>,
    ) => {
      if (!detectorRef.current) return;
      try {
        const r = await detectorRef.current.detectFromVideoFrame(video, offscreen, landmarks);
        setResult(r);
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
      }
    },
    [],
  );

  const reset = useCallback(() => {
    detectorRef.current?.resetHistory();
    setResult(null);
  }, []);

  return { result, loading, error, detect, reset };
}
