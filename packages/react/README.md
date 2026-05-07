# @framefind/react

React hook for real-time glasses detection. Handles the detector lifecycle (load on mount, dispose on unmount) and exposes a `detect` function you call each frame.

## Installation

```bash
npm install @framefind/react @framefind/core onnxruntime-web
```

## useGlassesDetector

```ts
import { useGlassesDetector } from "@framefind/react";
```

### Options

```ts
useGlassesDetector({
  modelUrl: string,         // ONNX model URL
  wasmPaths?: string,       // folder containing onnxruntime .wasm files
  threshold?: number,       // decision threshold (default 0.35)
  smoothingWindow?: number, // frames to average (default 8)
  enabled?: boolean,        // set to false to skip loading and detection (default true)
})
```

### Return value

```ts
{
  result: DetectionResult | null, // null until the first detection runs
  loading: boolean,               // true while the model is loading
  error: Error | null,
  detect: (video, offscreen, landmarks?) => Promise<void>,
  reset: () => void,              // clears smoothing history
}
```

### Webcam example

```tsx
import { useEffect, useRef } from "react";
import { useGlassesDetector } from "@framefind/react";

export function GlassesCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const offscreenRef = useRef(document.createElement("canvas"));
  const rafRef = useRef<number>();

  const { result, loading, error, detect } = useGlassesDetector({
    modelUrl: "https://cdn.framefind.moraxh.dev/glasses/v1/glasses.onnx",
  });

  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then(stream => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      });
  }, []);

  useEffect(() => {
    if (loading || !videoRef.current) return;

    function loop() {
      if (videoRef.current) {
        detect(videoRef.current, offscreenRef.current);
      }
      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current!);
  }, [loading, detect]);

  if (loading) return <p>Loading model...</p>;
  if (error) return <p>Error: {error.message}</p>;

  return (
    <div>
      <video ref={videoRef} autoPlay muted playsInline />
      <p>
        {result?.glasses ? "Wearing glasses" : "No glasses"} —{" "}
        {((result?.probability ?? 0) * 100).toFixed(1)}%
      </p>
    </div>
  );
}
```

### With MediaPipe landmarks

If you already have landmarks from MediaPipe FaceMesh, pass them to `detect` on every call. The detector will crop the eye region and accuracy improves.

```ts
detect(video, offscreen, faceLandmarks);
```

Expected format: `Array<{ x: number; y: number; z: number }>` — exactly what MediaPipe returns.

### The `enabled` prop

Useful for pausing detection without unmounting the component:

```tsx
const { result, detect } = useGlassesDetector({
  modelUrl: "...",
  enabled: isActive,
});
```

Switching from `false` to `true` reloads the model. Switching to `false` disposes it and cleans up.

## GitHub

[github.com/moraxh/Framefind](https://github.com/moraxh/Framefind)
