<p align="center">
  
  ![image](/media/banner.png)
</p>

<h1 align="center">FrameFind</h1>

<p align="center">
  Real-time on-device face analysis for the browser and Node.js
</p>

<p align="center">
  <a href="https://framefind.moraxh.dev/"><strong>→ Live Demo</strong></a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@framefind/core"><img src="https://img.shields.io/npm/v/@framefind/core?label=%40framefind%2Fcore&color=06b6d4" alt="npm core" /></a>
  <a href="https://www.npmjs.com/package/@framefind/react"><img src="https://img.shields.io/npm/v/@framefind/react?label=%40framefind%2Freact&color=06b6d4" alt="npm react" /></a>
  <a href="https://www.npmjs.com/package/@framefind/core"><img src="https://img.shields.io/npm/dm/@framefind/core?color=06b6d4" alt="downloads" /></a>
  <img src="https://img.shields.io/badge/model-6.1%20MiB%20each-06b6d4" alt="model size" />
  <img src="https://img.shields.io/badge/model--only%20CPU-sub--2ms-06b6d4" alt="sub-2ms model-only CPU inference" />
  <img src="https://img.shields.io/badge/license-MIT-06b6d4" alt="license" />
</p>

---

FrameFind detects what's on and around a face in real time, running entirely on-device. No frames are sent to any server — inference runs locally in the browser via WASM/WebGPU or in Node.js via the native ONNX runtime.

## Detectors

| Detector | Task | Runtime |
|---|---|---|
| **Glasses** | Is the person wearing glasses? | ONNX classifier |
| **Mask** | Is the person wearing a face mask, and how (`with_mask` / `without_mask` / `incorrect_mask`)? | ONNX classifier |
| **Blink** | Real-time blink events from eye-aspect-ratio + blendshapes | MediaPipe FaceLandmarker |
| **Gaze** | Where on screen the user is looking (region + normalized coordinates), with optional calibration | MediaPipe FaceLandmarker |
| **Head pose** | Yaw / pitch / roll estimation | MediaPipe FaceLandmarker |

Each detector ships as its own class in `@framefind/core` (browser and Node.js) and its own hook in `@framefind/react`.

## Why local inference?

Most vision APIs need a round-trip to a server: your frame leaves the device, gets processed, and comes back. That adds latency, costs money per call, exposes biometric data, and breaks offline.

FrameFind runs inference in the browser itself:

- **Zero latency from network** — inference happens on the same machine that captured the frame
- **Privacy by default** — camera data never leaves the device
- **No usage costs** — once the model is cached (~6.1 MiB per ONNX model), every inference is free
- **Works offline** — no connection required after first load

## Benchmark

The repository includes a reproducible ONNX model-only benchmark:

```bash
pnpm --dir packages/core benchmark
```

The current run used ONNX Runtime Node.js with the CPU execution provider, 20 warm-up runs and 200 measured runs in this Linux x86_64 environment:

| Model | Size on disk | Median | p95 |
|---|---:|---:|---:|
| Glasses | 6.11 MiB | 0.79 ms | 0.96 ms |
| Mask | 6.12 MiB | 0.88 ms | 1.21 ms |
| Input resolution | 112 × 112 | — | — |

These numbers measure ONNX execution only. They do not represent complete browser-frame latency, camera capture, face landmark detection or model download time. The practical claim is therefore “sub-2 ms model inference on the benchmark environment,” not sub-2 ms end-to-end frame processing.

## Browser compatibility

| Runtime | Status |
|---|---|
| WASM | Supported target for modern browsers |
| WebGPU | Optional acceleration where the browser supports it |

WASM is the compatibility path for modern browsers. WebGPU is an optional acceleration path and depends on browser and device support.

## WebGPU vs WASM

| | WebGPU | WASM |
|---|---|---|
| Inference speed | Not benchmarked in this repository | See the reproducible CPU benchmark above |
| Compatibility | Chrome/Safari TP | All modern browsers |
| GPU required | Yes | No |
| Fallback | → WASM | — |

FrameFind uses WASM by default (via `onnxruntime-web`) and falls back gracefully. Pass `preferGpu: true` to a detector's options to try WebGPU first.

## Architecture

```
Frame / Image
     │
     ▼
Face Landmarker (MediaPipe)
     │
     ├─ landmarks found → crop region of interest (112×112)
     │
     └─ no landmarks   → centered crop fallback
                              │
              ┌───────────────┴───────────────┐
              ▼                                ▼
      ONNX Model (glasses / mask)      Landmark geometry (blink / gaze / head pose)
      logit → sigmoid → probability    EAR, iris offsets, rotation angles
              │                                │
              ▼                                ▼
      Temporal smoothing (N frames)    One-Euro / EMA smoothing
              │                                │
              ▼                                ▼
   { glasses|mask, probability,       { blink | gaze | yaw/pitch/roll,
     faceDetected }                     faceDetected }
```

## Packages

```
packages/
  core/    → GlassesDetector, MaskDetector, BlinkDetector, GazeDetector,
             HeadPoseDetector — each with a browser and Node.js build
  react/   → useGlassesDetector, useMaskDetector, useBlinkDetector,
             useGazeDetector, useHeadPoseDetector hooks
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
import { GlassesDetector, MaskDetector } from "@framefind/core";

const glasses = new GlassesDetector({
  modelUrl: "https://cdn.framefind.moraxh.dev/glasses/v1/glasses.onnx",
});
await glasses.load();

const result = await glasses.detectFromCanvas(canvas, landmarks);
console.log(result.glasses, result.probability);

const mask = new MaskDetector({
  modelUrl: "https://cdn.framefind.moraxh.dev/models/mask/v1/mask.onnx",
});
await mask.load();

const maskResult = await mask.detectFromVideoFrame(video, offscreenCanvas);
console.log(maskResult.label, maskResult.mask, maskResult.probability);
```

## Quick start — React

```tsx
import { useGlassesDetector, useMaskDetector } from "@framefind/react";

function Camera() {
  const { videoRef, result } = useGlassesDetector({
    modelUrl: "https://cdn.framefind.moraxh.dev/glasses/v1/glasses.onnx",
  });

  return (
    <>
      <video ref={videoRef} autoPlay muted playsInline />
      <p>{result?.glasses ? "Wearing glasses" : "No glasses"}</p>
    </>
  );
}
```

Every hook (`useGlassesDetector`, `useMaskDetector`, `useBlinkDetector`, `useGazeDetector`, `useHeadPoseDetector`) follows the same shape: pass a `videoRef` (or let the hook create one), get back `{ result, loading, error, pause, resume, reset, ... }`, and it drives detection off `requestAnimationFrame` internally.

## Quick start — Node.js

```ts
import { GlassesDetectorNode } from "@framefind/core/node";

const detector = new GlassesDetectorNode({
  modelPath: "./glasses.onnx",
});

await detector.load();
const result = await detector.detectFromImagePath("./photo.jpg"); // requires sharp
```

`MaskDetectorNode`, `BlinkDetectorNode`, `GazeDetectorNode`, and `HeadPoseDetectorNode` are available the same way from `@framefind/core/node`.

## How it works

1. Receives a video frame, canvas, or image buffer
2. Runs MediaPipe FaceLandmarker to get facial landmarks
3. **ONNX detectors** (glasses, mask): crop the relevant region using landmarks (34 keypoints), resize to 112×112, normalize, run the ONNX model, and get a logit → sigmoid → probability
4. **Geometry detectors** (blink, gaze, head pose): compute eye-aspect-ratio, iris offsets, or rotation angles directly from landmarks
5. Smooths results over time (frame averaging, One-Euro filter, or EMA depending on the detector) to avoid flickering/jitter
6. Returns a typed result object, always including `faceDetected`

## What's next

Glasses detection was the starting point, not the ceiling — FrameFind is about understanding what's on and around a face, frame by frame. Currently shipped: glasses, mask, blink, gaze, and head pose detection.

Ideas being explored next:

- **Face attributes** — age range, expression, skin tone-agnostic attributes
- **Emotion recognition** — basic expression classification
- **Liveness / anti-spoofing** — distinguish a real face from a photo or screen

Same architecture, same on-device approach. Each detector ships as its own model and package so you only pull in what you need.

## Links

- [Live Demo](https://framefind.moraxh.dev/)
- [npm — @framefind/core](https://www.npmjs.com/package/@framefind/core)
- [npm — @framefind/react](https://www.npmjs.com/package/@framefind/react)
- [npm — @framefind/utils](https://www.npmjs.com/package/@framefind/utils)
- [GitHub](https://github.com/moraxh/Framefind)
