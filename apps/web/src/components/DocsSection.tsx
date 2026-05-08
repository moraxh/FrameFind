"use client";

import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { FadeIn } from "./FadeIn";
import { CodeBlock } from "./CodeBlock";
import { Sparkles } from "lucide-react";

async function fetchVersion(pkg: string): Promise<string | null> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${pkg}/latest`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return data.version ?? null;
  } catch {
    return null;
  }
}

const PACKAGES = [
  {
    name: "@framefind/core",
    description: "Glasses detection core — browser and Node.js",
    sections: [
      {
        label: "Browser · GlassesDetector",
        items: [
          { name: "new GlassesDetector(options)", kind: "class", description: "Options: modelUrl, wasmPaths, threshold (default 0.35), smoothingWindow (default 8)." },
          { name: "detector.load()", kind: "method", description: "Initialize ONNX model. Await before calling detect methods." },
          { name: "detector.detectFromImageData(pixels, w, h, landmarks?)", kind: "method", description: "Run inference on raw RGBA pixel buffer." },
          { name: "detector.detectFromCanvas(canvas, landmarks?)", kind: "method", description: "Run inference on an HTMLCanvasElement." },
          { name: "detector.detectFromVideoFrame(video, offscreenCanvas, landmarks?)", kind: "method", description: "Run inference on a live video frame." },
          { name: "detector.resetHistory()", kind: "method", description: "Clear smoothing window history." },
          { name: "detector.dispose()", kind: "method", description: "Release ONNX session and free memory." },
        ],
      },
      {
        label: "Node.js · GlassesDetectorNode",
        items: [
          { name: "new GlassesDetectorNode(options)", kind: "class", description: "Options: modelPath (local path), threshold, smoothingWindow." },
          { name: "detector.load()", kind: "method", description: "Load model via onnxruntime-node." },
          { name: "detector.detectFromRgbaBuffer(pixels, faceDetected?)", kind: "method", description: "Inference from raw RGBA Buffer." },
          { name: "detector.detectFromImagePath(path)", kind: "method", description: "Load image from disk and run inference." },
          { name: "detector.resetHistory()", kind: "method", description: "Clear smoothing window history." },
          { name: "detector.dispose()", kind: "method", description: "Release model resources." },
        ],
      },
    ],
  },
  {
    name: "@framefind/react",
    description: "React hooks for FrameFind glasses detection",
    sections: [
      {
        label: "Hooks",
        items: [
          { name: "useGlassesDetector(options)", kind: "hook", description: "Loads detector on mount, disposes on unmount. Returns result, loading, error, detect(), reset()." },
          { name: "options.modelUrl", kind: "option", description: "Required. URL to .onnx model file." },
          { name: "options.wasmPaths", kind: "option", description: "Folder path for onnxruntime .wasm files." },
          { name: "options.threshold", kind: "option", description: "Binary cutoff. Default 0.35." },
          { name: "options.smoothingWindow", kind: "option", description: "Frames averaged. Default 8." },
          { name: "options.enabled", kind: "option", description: "Pause detection without unmounting." },
        ],
      },
    ],
  },
  {
    name: "@framefind/utils",
    description: "Shared types, constants, and helpers",
    sections: [
      {
        label: "Types",
        items: [
          { name: "DetectionResult", kind: "type", description: "{ glasses: boolean; probability: number; faceDetected: boolean }" },
          { name: "DetectorConfig", kind: "type", description: "{ modelUrl: string; threshold?: number; smoothingWindow?: number }" },
        ],
      },
      {
        label: "Constants",
        items: [
          { name: "GLASSES_MODEL_URL", kind: "const", description: "Official CDN URL for the ONNX model." },
          { name: "DEFAULT_THRESHOLD", kind: "const", description: "0.35 — binary decision cutoff." },
          { name: "DEFAULT_SMOOTH_N", kind: "const", description: "8 — frames averaged for smoothing." },
          { name: "ROI_SIZE", kind: "const", description: "112 — crop size the model expects (px)." },
          { name: "EYE_REGION_IDX", kind: "const", description: "MediaPipe landmark indices covering the eye region." },
          { name: "MEAN / STD", kind: "const", description: "[0.485, 0.456, 0.406] / [0.229, 0.224, 0.225] — ImageNet normalization." },
        ],
      },
      {
        label: "Functions",
        items: [
          { name: "sigmoid(x: number): number", kind: "fn", description: "Converts raw model logit to probability." },
          { name: "smoothAverage(history: number[]): number", kind: "fn", description: "Averages prediction history for temporal smoothing." },
          { name: "imageDataToChwFloat32(pixels, width, height): Float32Array", kind: "fn", description: "RGBA buffer → CHW Float32 tensor normalized with MEAN/STD." },
        ],
      },
    ],
  },
];

const KIND_COLORS: Record<string, string> = {
  class:  "text-violet-400 bg-violet-400/10 border-violet-400/20",
  method: "text-cyan-400 bg-cyan-400/10 border-cyan-400/20",
  hook:   "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  option: "text-neutral-400 bg-neutral-400/10 border-neutral-700",
  type:   "text-sky-400 bg-sky-400/10 border-sky-400/20",
  const:  "text-amber-400 bg-amber-400/10 border-amber-400/20",
  fn:     "text-rose-400 bg-rose-400/10 border-rose-400/20",
};

const DETECTION_RESULT_TYPE = `type DetectionResult = {
  glasses: boolean;      // true if glasses detected
  probability: number;   // smoothed confidence 0–1
  faceDetected: boolean; // true if landmarks provided
};`;

const DETECTOR_CONFIG_TYPE = `type DetectorConfig = {
  modelUrl: string;
  threshold?: number;       // default: 0.35
  smoothingWindow?: number; // default: 8
};`;

const REACT_EXAMPLE = `const {
  result,    // DetectionResult | null
  loading,   // boolean
  error,     // Error | null
  detect,    // (video, canvas, landmarks?) => void
  reset,     // () => void
} = useGlassesDetector({ modelUrl: '/model.onnx' });`;

export function DocsSection() {
  const [versions, setVersions] = useState<Record<string, string>>({});

  useEffect(() => {
    Promise.all(
      PACKAGES.map(async (pkg) => {
        const v = await fetchVersion(pkg.name);
        return [pkg.name, v] as const;
      })
    ).then((results) => {
      const map: Record<string, string> = {};
      for (const [name, v] of results) {
        if (v) map[name] = v;
      }
      setVersions(map);
    });
  }, []);

  return (
    <section id="docs" className="py-24 px-6 border-t border-neutral-800/60">
      <div className="max-w-6xl mx-auto">
        <FadeIn>
          <div className="mb-10 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-medium tracking-tight text-white mb-3">API Reference</h2>
              <p className="text-sm text-neutral-400 max-w-xl leading-relaxed">
                Complete reference for all public APIs across the three FrameFind packages.
              </p>
            </div>
          </div>
        </FadeIn>

        <div className="space-y-16">
          {PACKAGES.map((pkg, pi) => (
            <FadeIn key={pkg.name} delay={pi * 0.06}>
              <div>
                <div className="flex items-center gap-3 mb-6 flex-wrap">
                  <h3 className="text-sm font-mono font-medium text-white">{pkg.name}</h3>
                  <span className="text-xs text-neutral-600">{pkg.description}</span>
                  <AnimatePresence>
                    {versions[pkg.name] && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.2 }}
                        className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-cyan-500/30 bg-cyan-500/5 text-cyan-400"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span className="text-[11px] font-mono font-medium">v{versions[pkg.name]}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="grid lg:grid-cols-2 gap-6">
                  <div className="space-y-6">
                    {pkg.sections.map((section) => (
                      <div key={section.label}>
                        <div className="text-xs font-mono text-neutral-600 mb-3 uppercase tracking-wide">
                          {section.label}
                        </div>
                        <div className="space-y-2">
                          {section.items.map((item) => (
                            <div
                              key={item.name}
                              className="p-3.5 rounded-lg border border-neutral-800 bg-[#111] hover:border-neutral-700 transition-colors"
                            >
                              <div className="flex items-start justify-between gap-3 mb-1.5">
                                <code className="text-xs text-white font-mono leading-relaxed break-all">{item.name}</code>
                                <span className={`text-xs font-medium px-2 py-0.5 rounded border shrink-0 ${KIND_COLORS[item.kind]}`}>
                                  {item.kind}
                                </span>
                              </div>
                              <p className="text-xs text-neutral-500 leading-relaxed">{item.description}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  {pi === 0 && (
                    <div className="space-y-4">
                      <div className="text-xs font-mono text-neutral-600 mb-3 uppercase tracking-wide">
                        Return type
                      </div>
                      <div className="rounded-xl overflow-hidden border border-neutral-800 bg-[#111]">
                        <div className="px-4 py-2 border-b border-neutral-800 text-xs font-mono text-neutral-500">
                          DetectionResult
                        </div>
                        <div>
                          <CodeBlock plain language="typescript" code={DETECTION_RESULT_TYPE} />
                        </div>
                      </div>
                      <div className="rounded-xl overflow-hidden border border-neutral-800 bg-[#111]">
                        <div className="px-4 py-2 border-b border-neutral-800 text-xs font-mono text-neutral-500">
                          DetectorConfig
                        </div>
                        <div>
                          <CodeBlock plain language="typescript" code={DETECTOR_CONFIG_TYPE} />
                        </div>
                      </div>
                    </div>
                  )}

                  {pi === 1 && (
                    <div>
                      <div className="text-xs font-mono text-neutral-600 mb-3 uppercase tracking-wide">
                        Hook return shape
                      </div>
                      <div className="rounded-xl overflow-hidden border border-neutral-800 bg-[#111]">
                        <div className="px-4 py-2 border-b border-neutral-800 text-xs font-mono text-neutral-500">
                          useGlassesDetector
                        </div>
                        <div>
                          <CodeBlock plain language="typescript" code={REACT_EXAMPLE} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}
