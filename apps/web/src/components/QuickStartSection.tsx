"use client";

import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { FadeIn } from "./FadeIn";
import { CodeBlock } from "./CodeBlock";

type PackageManager = "npm" | "pnpm" | "yarn" | "bun";
type Tab = "react" | "browser" | "node";

const PACKAGE_MANAGERS: PackageManager[] = ["npm", "pnpm", "yarn", "bun"];

const TAB_CODE: Record<Tab, { language: string; code: string }> = {
  react: {
    language: "tsx",
    code: `import { useRef, useEffect } from 'react';
import { useGlassesDetector } from '@framefind/react';

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { result, loading, error, detect, reset } = useGlassesDetector({
    modelUrl: '/models/glasses.onnx',
    threshold: 0.35,
    smoothingWindow: 8,
  });

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true }).then((stream) => {
      if (videoRef.current) videoRef.current.srcObject = stream;
    });
  }, []);

  return (
    <div className="p-4">
      <video ref={videoRef} autoPlay playsInline muted
        onPlay={() => {
          setInterval(() => {
            if (videoRef.current && canvasRef.current)
              detect(videoRef.current, canvasRef.current);
          }, 66);
        }}
      />
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      {loading && <p>Loading model…</p>}
      {error && <p>Error: {error.message}</p>}
      {result && (
        <div className="mt-4">
          <p>Status: {result.glasses ? 'Glasses Detected' : 'No Glasses'}</p>
          <p>Confidence: {(result.probability * 100).toFixed(1)}%</p>
        </div>
      )}
      <button onClick={reset}>Reset</button>
    </div>
  );
}`,
  },
  browser: {
    language: "typescript",
    code: `import { GlassesDetector } from '@framefind/core';

const detector = new GlassesDetector({
  modelUrl: '/models/glasses.onnx',
  threshold: 0.35,      // default
  smoothingWindow: 8,   // frames averaged
});

await detector.load();

const video = document.getElementById('camera') as HTMLVideoElement;
const canvas = document.createElement('canvas');

video.addEventListener('play', () => {
  setInterval(async () => {
    const result = await detector.detectFromVideoFrame(video, canvas);
    console.log('Glasses:', result.glasses);
    console.log('Probability:', result.probability);
  }, 66);
});`,
  },
  node: {
    language: "typescript",
    code: `import { GlassesDetectorNode } from '@framefind/core/node';

async function analyzeImage(imagePath: string) {
  const detector = new GlassesDetectorNode({
    modelPath: './models/glasses.onnx',
    threshold: 0.35,
    smoothingWindow: 8,
  });

  await detector.load();

  const result = await detector.detectFromImagePath(imagePath);

  await detector.dispose();

  return {
    woreGlasses: result.glasses,
    confidence: result.probability,
    faceDetected: result.faceDetected,
  };
}`,
  },
};

function getInstallCommand(pm: PackageManager, packages: string): string {
  switch (pm) {
    case "pnpm":
      return `pnpm add ${packages}`;
    case "yarn":
      return `yarn add ${packages}`;
    case "bun":
      return `bun add ${packages}`;
    default:
      return `npm install ${packages}`;
  }
}

export function QuickStartSection() {
  const [activeTab, setActiveTab] = useState<Tab>("react");
  const [packageManager, setPackageManager] = useState<PackageManager>("npm");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("packageManager") as PackageManager;
    if (PACKAGE_MANAGERS.includes(saved)) setPackageManager(saved);
  }, []);

  const handleManagerChange = (pm: PackageManager) => {
    setPackageManager(pm);
    localStorage.setItem("packageManager", pm);
  };

  const cmd = (packages: string) =>
    mounted ? getInstallCommand(packageManager, packages) : `npm install ${packages}`;

  return (
    <section className="py-24 px-6">
      <div className="max-w-6xl mx-auto grid lg:grid-cols-[1fr_1.5fr] gap-16">
        <FadeIn>
          <div>
            <h2 className="text-2xl font-medium tracking-tight text-white mb-6">
              Quick start
            </h2>
            <p className="text-sm text-neutral-400 mb-8 leading-relaxed">
              FrameFind is modular. Install the core SDK for raw JS environments,
              or the React bindings for hook-based state management.
            </p>
            <div className="space-y-4">
              <div className="flex items-center gap-1.5 mb-6 bg-neutral-900/50 p-1 w-fit rounded-lg border border-neutral-800">
                {PACKAGE_MANAGERS.map((pm) => (
                  <button
                    key={pm}
                    onClick={() => handleManagerChange(pm)}
                    className={`px-3 py-1.5 text-xs font-mono rounded-md transition-colors ${
                      packageManager === pm
                        ? "bg-neutral-800 text-white shadow-sm"
                        : "bg-transparent text-neutral-500 hover:text-neutral-300"
                    }`}
                  >
                    {pm}
                  </button>
                ))}
              </div>
              <div>
                <div className="text-xs font-mono text-neutral-500 mb-2 uppercase tracking-wide">
                  Core Engine
                </div>
                <CodeBlock code={cmd("@framefind/core onnxruntime-web")} language="bash" />
              </div>
              <div>
                <div className="text-xs font-mono text-neutral-500 mb-2 uppercase tracking-wide">
                  React Support
                </div>
                <CodeBlock code={cmd("@framefind/react")} language="bash" />
              </div>
              <div>
                <div className="text-xs font-mono text-neutral-500 mb-2 uppercase tracking-wide">
                  Node.js Server
                </div>
                <CodeBlock code={cmd("onnxruntime-node")} language="bash" />
              </div>
            </div>
          </div>
        </FadeIn>

        <FadeIn delay={0.1}>
          <div className="bg-[#111111] border border-neutral-800 rounded-xl overflow-hidden h-full flex flex-col">
            <div className="flex border-b border-neutral-800">
              {(["react", "browser", "node"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-6 py-3 text-sm font-medium transition-colors ${
                    activeTab === tab
                      ? "border-b border-cyan-400 text-white bg-white/5"
                      : "text-neutral-500 hover:text-neutral-300 hover:bg-white/[0.02]"
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
            <div className="relative bg-[#0d0d0d] min-h-[22rem] overflow-hidden">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                >
                  <CodeBlock
                    plain
                    language={TAB_CODE[activeTab].language}
                    code={TAB_CODE[activeTab].code}
                  />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
