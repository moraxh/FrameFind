import { type RefObject, useEffect, useRef } from "react";

type VideoElWithRVFC = HTMLVideoElement & {
	requestVideoFrameCallback?: (
		cb: (now: number, metadata: VideoFrameCallbackMetadata) => void,
	) => number;

	cancelVideoFrameCallback?: (handle: number) => void;
};

export type UseVideoFrameDetectOptions = {
	enabled?: boolean;

	/**
	 * Skip duplicated frames when using RAF fallback.
	 * Default: true
	 */
	skipDuplicateFrames?: boolean;

	/**
	 * Pause processing.
	 * Default: false
	 */
	paused?: boolean;
};

/**
 * Runs a callback on every unique video frame.
 *
 * Uses:
 * - requestVideoFrameCallback when available
 * - requestAnimationFrame fallback otherwise
 *
 * Automatically:
 * - skips duplicated frames
 * - prevents overlapping async processing
 * - handles cleanup safely
 */
export function useVideoFrameDetect(
	videoRef: RefObject<HTMLVideoElement | null> | HTMLVideoElement | null,
	callback: (video: HTMLVideoElement) => void | Promise<void>,
	opts: UseVideoFrameDetectOptions = {},
): void {
	const { enabled = true, skipDuplicateFrames = true, paused = false } = opts;

	const callbackRef = useRef(callback);

	callbackRef.current = callback;

	const processingRef = useRef(false);

	const lastVideoTimeRef = useRef<number | null>(null);

	const videoRefObj = useRef(videoRef);
	videoRefObj.current = videoRef;

	useEffect(() => {
		const video =
			videoRefObj.current instanceof HTMLVideoElement || videoRefObj.current === null
				? videoRefObj.current
				: videoRefObj.current.current;

		if (!video) return;

		if (!enabled) return;

		if (paused) return;

		const v = video as VideoElWithRVFC;

		let cancelled = false;

		let rvfcHandle: number | null = null;

		let rafHandle: number | null = null;

		const useRvfc = typeof v.requestVideoFrameCallback === "function";

		const processFrame = async () => {
			if (cancelled) return;

			if (processingRef.current) return;

			if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
				return;
			}

			if (skipDuplicateFrames) {
				const currentTime = video.currentTime;

				if (lastVideoTimeRef.current === currentTime) {
					return;
				}

				lastVideoTimeRef.current = currentTime;
			}

			processingRef.current = true;

			try {
				await callbackRef.current(video);
			} finally {
				processingRef.current = false;
			}
		};

		const tickRvfc = () => {
			if (cancelled) return;

			if (!cancelled && v.requestVideoFrameCallback) {
				rvfcHandle = v.requestVideoFrameCallback(tickRvfc);
			}

			processFrame();
		};

		const tickRaf = () => {
			if (cancelled) return;

			rafHandle = requestAnimationFrame(tickRaf);

			processFrame();
		};

		const startLoop = () => {
			if (cancelled) return;
			if (useRvfc) {
				rvfcHandle = v.requestVideoFrameCallback!(tickRvfc);
			} else {
				rafHandle = requestAnimationFrame(tickRaf);
			}
		};

		if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA || !video.paused) {
			startLoop();
		} else {
			video.addEventListener("play", startLoop, { once: true });
		}

		return () => {
			cancelled = true;

			video.removeEventListener("play", startLoop);

			if (rvfcHandle !== null && v.cancelVideoFrameCallback) {
				v.cancelVideoFrameCallback(rvfcHandle);
			}

			if (rafHandle !== null) {
				cancelAnimationFrame(rafHandle);
			}
		};
	}, [enabled, paused, skipDuplicateFrames]);
}
