import { stat } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as ort from "onnxruntime-node";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const models = [
  { name: "glasses", path: resolve(root, "models/glasses/v1/glasses.onnx") },
  { name: "mask", path: resolve(root, "models/mask/v1/mask.onnx") },
];

const WARMUP = 20;
const SAMPLES = 200;
const inputSize = 1 * 3 * 112 * 112;
const input = new ort.Tensor("float32", new Float32Array(inputSize), [1, 3, 112, 112]);

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

for (const model of models) {
  const bytes = (await stat(model.path)).size;
  const session = await ort.InferenceSession.create(model.path, {
    executionProviders: ["cpu"],
  });
  const inputName = session.inputNames[0];
  const timings = [];

  for (let i = 0; i < WARMUP + SAMPLES; i += 1) {
    const start = performance.now();
    await session.run({ [inputName]: input });
    if (i >= WARMUP) timings.push(performance.now() - start);
  }

  console.log(JSON.stringify({
    model: model.name,
    bytes,
    mib: Number((bytes / 1024 / 1024).toFixed(2)),
    input: "112x112",
    backend: "onnxruntime-node/cpu",
    samples: SAMPLES,
    medianMs: Number(percentile(timings, 50).toFixed(2)),
    p95Ms: Number(percentile(timings, 95).toFixed(2)),
  }));

  await session.release();
}
