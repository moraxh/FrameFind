# FrameFind

FrameFind detects whether someone is wearing glasses in real time, running entirely on-device. No frames are sent to any server — the ONNX model runs locally, in the browser via WASM or in Node.js via the native runtime.

The model focuses on the eye region rather than the full face. Pass MediaPipe landmarks and it crops that area before inference. No landmarks? It falls back to a centered crop and still works fine.

The glasses model weighs **6.2 MB** — small enough to load over a typical connection in under a second and cache for instant startup on repeat visits.

## Packages

```
packages/
  core/    → GlassesDetector (browser) and GlassesDetectorNode (Node.js)
  react/   → useGlassesDetector hook
  utils/   → shared types, constants, and helpers
```

## Installation

```bash
# Browser / React
npm install @framefind/core onnxruntime-web
npm install @framefind/react onnxruntime-web react

# Node.js
npm install @framefind/core onnxruntime-node
```

## Quick start — browser

```ts
import { GlassesDetector } from "@framefind/core";

const detector = new GlassesDetector({
  modelUrl: "https://cdn.framefind.moraxh.dev/glasses/v1/glasses.onnx",
});

await detector.load();

const result = await detector.detectFromCanvas(canvas, landmarks);
console.log(result.glasses, result.probability);
```

## Quick start — React

```tsx
import { useGlassesDetector } from "@framefind/react";

function Camera() {
  const { result, loading, detect } = useGlassesDetector({
    modelUrl: "https://cdn.framefind.moraxh.dev/glasses/v1/glasses.onnx",
  });

  // call detect() each frame via requestAnimationFrame
  return <p>{result?.glasses ? "Wearing glasses" : "No glasses"}</p>;
}
```

## Quick start — Node.js

```ts
import { GlassesDetectorNode } from "@framefind/core/node";

const detector = new GlassesDetectorNode({
  modelPath: "./glasses.onnx",
});

await detector.load();
const result = await detector.detectFromImagePath("./photo.jpg"); // requires sharp
```

## How it works

1. Receives a video frame, canvas, or image buffer
2. If MediaPipe landmarks are provided, extracts the eye region using 34 keypoints
3. Resizes to 112×112 and normalizes with ImageNet mean/std
4. Runs the ONNX model, gets a logit → sigmoid → probability
5. Smooths the last N predictions to avoid flickering
6. Returns `{ glasses, probability, faceDetected }`

## What's next

Glasses detection is the starting point, not the ceiling. The name isn't tied to any single task — FrameFind is about understanding what's on and around a face, frame by frame.

Planned detectors:

- **Mask** — is the person wearing a face mask?
- **Eyes open/closed** — blink detection, drowsiness
- **Face attributes** — age range, expression, skin tone-agnostic attributes
- **Head pose** — yaw, pitch, roll estimation
- **Attention** — is the person looking at the screen?
- **Iris tracking** — gaze direction without eye-tracking hardware

Same architecture, same on-device approach. Each detector ships as its own model and package so you only pull in what you need.

## Links

- [npm — @framefind/core](https://www.npmjs.com/package/@framefind/core)
- [npm — @framefind/react](https://www.npmjs.com/package/@framefind/react)
- [npm — @framefind/utils](https://www.npmjs.com/package/@framefind/utils)
- [GitHub](https://github.com/moraxh/Framefind)
