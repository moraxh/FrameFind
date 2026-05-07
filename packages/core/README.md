# @framefind/core

Glasses detection for browser and Node.js. Two separate classes with the same conceptual interface: `GlassesDetector` for the browser (WASM) and `GlassesDetectorNode` for Node.js (native CPU).

## Installation

```bash
# Browser
npm install @framefind/core onnxruntime-web

# Node.js
npm install @framefind/core onnxruntime-node
```

## GlassesDetector — browser

```ts
import { GlassesDetector } from "@framefind/core";
// or explicitly:
import { GlassesDetector } from "@framefind/core/browser";
```

### Constructor

```ts
new GlassesDetector({
  modelUrl: string,         // ONNX model URL
  wasmPaths?: string,       // folder containing onnxruntime .wasm files (defaults to jsDelivr CDN)
  threshold?: number,       // decision threshold (default 0.35)
  smoothingWindow?: number, // how many frames to average (default 8)
})
```

### Methods

```ts
// Load the model. Call once before any detection.
await detector.load()

// From raw RGBA pixels
await detector.detectFromImageData(pixels, width, height, landmarks?)

// From a <canvas> element
await detector.detectFromCanvas(canvas, landmarks?)

// From a <video> + offscreen canvas (recommended for webcam)
await detector.detectFromVideoFrame(video, offscreenCanvas, landmarks?)

// Clear smoothing history
detector.resetHistory()

// Release the model from memory
detector.dispose()
```

`landmarks` are optional. If provided (MediaPipe format: `{ x, y, z }[]`), the detector crops the eye region before inference. Without them it falls back to a centered square crop.

### Result shape

```ts
{
  glasses: boolean,      // true if glasses are detected
  probability: number,   // smoothed probability (0–1)
  faceDetected: boolean, // true if landmarks were provided
}
```

### Webcam example

```ts
const detector = new GlassesDetector({
  modelUrl: "https://cdn.framefind.moraxh.dev/glasses/v1/glasses.onnx",
});
await detector.load();

const offscreen = document.createElement("canvas");

async function loop() {
  const result = await detector.detectFromVideoFrame(video, offscreen);
  console.log(result.glasses);
  requestAnimationFrame(loop);
}

loop();
```

---

## GlassesDetectorNode — Node.js

```ts
import { GlassesDetectorNode } from "@framefind/core/node";
```

### Constructor

```ts
new GlassesDetectorNode({
  modelPath: string,        // local path to the .onnx file
  threshold?: number,
  smoothingWindow?: number,
})
```

### Methods

```ts
await detector.load()

// Pre-cropped and resized 112×112 RGBA buffer
await detector.detectFromRgbaBuffer(pixels, faceDetected?)

// From an image file path (requires `sharp`)
await detector.detectFromImagePath(path)

detector.resetHistory()
await detector.dispose()
```

### Example with sharp

```ts
import { GlassesDetectorNode } from "@framefind/core/node";

const detector = new GlassesDetectorNode({ modelPath: "./glasses.onnx" });
await detector.load();

const result = await detector.detectFromImagePath("./photo.jpg");
console.log(result.glasses, result.probability);

await detector.dispose();
```

`sharp` is not a direct dependency — if you already have the RGBA buffer, you don't need it.

---

## GitHub

[github.com/moraxh/Framefind](https://github.com/moraxh/Framefind)
