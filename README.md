<p align="center">
  
  ![image](/media/banner.png)
</p>

<h1 align="center">FrameFind</h1>

<p align="center">
  Real-time on-device glasses detection for the browser and Node.js
</p>

<p align="center">
  <a href="https://framefind.moraxh.dev/"><strong>→ Live Demo</strong></a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@framefind/core"><img src="https://img.shields.io/npm/v/@framefind/core?label=%40framefind%2Fcore&color=06b6d4" alt="npm core" /></a>
  <a href="https://www.npmjs.com/package/@framefind/react"><img src="https://img.shields.io/npm/v/@framefind/react?label=%40framefind%2Freact&color=06b6d4" alt="npm react" /></a>
  <a href="https://www.npmjs.com/package/@framefind/core"><img src="https://img.shields.io/npm/dm/@framefind/core?color=06b6d4" alt="downloads" /></a>
  <img src="https://img.shields.io/badge/model-6.2MB-06b6d4" alt="model size" />
  <img src="https://img.shields.io/badge/inference-~27ms-06b6d4" alt="inference time" />
  <img src="https://img.shields.io/badge/license-MIT-06b6d4" alt="license" />
</p>

---

FrameFind detects whether someone is wearing glasses in real time, running entirely on-device. No frames are sent to any server — the ONNX model runs locally in the browser via WASM or in Node.js via the native runtime.

## Why local inference?

Most vision APIs need a round-trip to a server: your frame leaves the device, gets processed, and comes back. That adds latency, costs money per call, exposes biometric data, and breaks offline.

FrameFind runs the model in the browser itself:

- **Zero latency from network** — inference happens on the same machine that captured the frame
- **Privacy by default** — camera data never leaves the device
- **No usage costs** — once the model is cached (~6.2 MB), every inference is free
- **Works offline** — no connection required after first load

## Benchmark

Measured on Chrome 124 / MacBook M2 with WASM backend, 200+ frames:

| Metric | Value |
|---|---|
| Median inference | ~27 ms |
| p95 inference | ~35 ms |
| Model size | 6.2 MB |
| First load (cached) | <50 ms |
| Input resolution | 112 × 112 |

## Browser compatibility

| Browser | WASM | WebGPU |
|---|---|---|
| Chrome 112+ | ✅ | ✅ |
| Firefox 110+ | ✅ | 🚧 |
| Safari 16.4+ | ✅ | ✅ |
| Edge 112+ | ✅ | ✅ |

WASM works everywhere. WebGPU accelerates inference where supported.

## WebGPU vs WASM

| | WebGPU | WASM |
|---|---|---|
| Inference speed | ~8 ms | ~27 ms |
| Compatibility | Chrome/Safari TP | All modern browsers |
| GPU required | Yes | No |
| Fallback | → WASM | — |

FrameFind uses WASM by default (via `onnxruntime-web`) and falls back gracefully. Switch to WebGPU by passing the executor option to onnxruntime-web.

## Architecture

```
Frame / Image
     │
     ▼
Face Landmarker (MediaPipe)
     │
     ├─ landmarks found → crop eye region (34 keypoints, 112×112)
     │
     └─ no landmarks   → centered crop fallback
                              │
                              ▼
                      ONNX Model (6.2 MB)
                      logit → sigmoid → probability
                              │
                              ▼
                      Temporal smoothing (N frames)
                              │
                              ▼
              { glasses, probability, faceDetected }
```

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

- [Live Demo](https://framefind.moraxh.dev/)
- [npm — @framefind/core](https://www.npmjs.com/package/@framefind/core)
- [npm — @framefind/react](https://www.npmjs.com/package/@framefind/react)
- [npm — @framefind/utils](https://www.npmjs.com/package/@framefind/utils)
- [GitHub](https://github.com/moraxh/Framefind)
