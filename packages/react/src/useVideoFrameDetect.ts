import { useEffect, useRef } from "react";

type VideoElWithRVFC = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, metadata: unknown) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

/**
 * Drives a per-frame callback using `requestVideoFrameCallback` when available,
 * falling back to `requestAnimationFrame`. Skips redundant frames to avoid
 * burning inference on duplicate webcam ticks.
 */
export function useVideoFrameDetect(
  video: HTMLVideoElement | null,
  callback: (video: HTMLVideoElement) => void,
  enabled: boolean = true,
): void {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    if (!video || !enabled) return;
    const v = video as VideoElWithRVFC;
    let rvfcHandle: number | null = null;
    let rafHandle: number | null = null;
    let cancelled = false;

    const useRvfc = typeof v.requestVideoFrameCallback === "function";

    const tickRvfc = () => {
      if (cancelled) return;
      cbRef.current(video);
      rvfcHandle = v.requestVideoFrameCallback!(tickRvfc);
    };

    const tickRaf = () => {
      if (cancelled) return;
      cbRef.current(video);
      rafHandle = requestAnimationFrame(tickRaf);
    };

    if (useRvfc) {
      rvfcHandle = v.requestVideoFrameCallback!(tickRvfc);
    } else {
      rafHandle = requestAnimationFrame(tickRaf);
    }

    return () => {
      cancelled = true;
      if (rvfcHandle !== null && v.cancelVideoFrameCallback) {
        v.cancelVideoFrameCallback(rvfcHandle);
      }
      if (rafHandle !== null) cancelAnimationFrame(rafHandle);
    };
  }, [video, enabled]);
}
