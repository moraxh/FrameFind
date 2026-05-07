# @framefind/utils

Shared types, constants, and helper functions used across FrameFind packages. You don't need to install this directly — `@framefind/core` and `@framefind/react` already pull it in.

If you're building something on top of the FrameFind ecosystem and need the types, installing it standalone makes sense.

## Installation

```bash
npm install @framefind/utils
```

## Types

```ts
type DetectionResult = {
  glasses: boolean;      // true if glasses are detected
  probability: number;   // smoothed probability between 0 and 1
  faceDetected: boolean; // true if MediaPipe landmarks were provided
};

type DetectorConfig = {
  modelUrl: string;
  threshold?: number;
  smoothingWindow?: number;
};
```

## Constants

```ts
GLASSES_MODEL_URL  // ONNX model URL on the official CDN
DEFAULT_THRESHOLD  // 0.35 — default cutoff for the binary decision
DEFAULT_SMOOTH_N   // 8 — number of frames averaged for smoothing
ROI_SIZE           // 112 — crop size the model expects
EYE_REGION_IDX     // MediaPipe landmark indices covering the eye region
MEAN               // [0.485, 0.456, 0.406] — ImageNet normalization
STD                // [0.229, 0.224, 0.225] — ImageNet normalization
```

## Functions

```ts
// Standard sigmoid. Converts the model's raw logit to a probability.
sigmoid(x: number): number

// Averages an array of numbers. Used to smooth predictions over time.
smoothAverage(history: number[]): number

// Converts an RGBA pixel buffer to a CHW Float32 tensor normalized with MEAN/STD.
// Input:  Uint8ClampedArray of width×height×4 bytes
// Output: Float32Array of 3×width×height (the format the model expects)
imageDataToChwFloat32(pixels: Uint8ClampedArray, width: number, height: number): Float32Array
```

## GitHub

[github.com/moraxh/Framefind](https://github.com/moraxh/Framefind)
