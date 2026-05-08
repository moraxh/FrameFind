"use client";

import { Terminal, CheckCircle2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { GithubIcon } from "./GithubIcon";
import { FadeIn } from "./FadeIn";
import { CodeBlock } from "./CodeBlock";
import { useState, useEffect } from "react";

type HeroTab = "react" | "browser" | "node";

const HERO_EXAMPLES: Record<HeroTab, { language: string; code: string }> = {
  react: {
    language: "tsx",
    code: `import { useRef } from 'react';
import { useGlassesDetector } from '@framefind/react';

export function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { result, detect } = useGlassesDetector({
    modelUrl: '/models/glasses.onnx',
  });

  return (
    <div>
      <video ref={videoRef} autoPlay playsInline muted
        onPlay={() => setInterval(() => {
          if (videoRef.current && canvasRef.current)
            detect(videoRef.current, canvasRef.current);
        }, 66)}
      />
      <canvas ref={canvasRef} hidden />
      <p>{result?.glasses ? '🕶 Glasses' : 'No glasses'}</p>
    </div>
  );
}`,
  },
  browser: {
    language: "typescript",
    code: `import { GlassesDetector } from '@framefind/core';

const detector = new GlassesDetector({
  modelUrl: '/models/glasses.onnx',
});

await detector.load();

const video = document.querySelector('video')!;
const canvas = document.createElement('canvas');

video.addEventListener('play', () => {
  setInterval(async () => {
    const result = await detector.detectFromVideoFrame(
      video,
      canvas,
    );
    console.log('Glasses:', result.glasses);
    console.log('Score:', result.probability);
  }, 66);
});`,
  },
  node: {
    language: "typescript",
    code: `import { GlassesDetectorNode } from '@framefind/core/node';

const detector = new GlassesDetectorNode({
  modelPath: './models/glasses.onnx',
});

await detector.load();

const result = await detector.detectFromImagePath(
  './photo.jpg',
);

console.log('Glasses:', result.glasses);
console.log('Confidence:', result.probability);

await detector.dispose();`,
  },
};

const PACKAGES = [
  { name: "@framefind/core", npm: "https://www.npmjs.com/package/@framefind/core" },
  { name: "@framefind/react", npm: "https://www.npmjs.com/package/@framefind/react" },
  { name: "@framefind/utils", npm: "https://www.npmjs.com/package/@framefind/utils" },
];

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

interface HeroSectionProps {
  installCommand: string;
}

export function HeroSection({ installCommand }: HeroSectionProps) {
  const [versions, setVersions] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<HeroTab>("react");

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

  const tabs: HeroTab[] = ["react", "browser", "node"];

  return (
    <section className="pt-24 pb-20 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
          <FadeIn>
            <div className="flex flex-wrap gap-2 mb-6">
              {PACKAGES.map((pkg) => {
                const shortName = pkg.name.replace("@framefind/", "");
                const version = versions[pkg.name];
                return (
                  <a
                    key={pkg.name}
                    href={pkg.npm}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-cyan-900/50 bg-cyan-950/20 text-cyan-400 text-[11px] font-medium tracking-wide uppercase hover:border-cyan-700/50 hover:bg-cyan-950/40 transition-colors"
                  >
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                    {shortName}
                    {version ? ` v${version}` : ""}
                  </a>
                );
              })}
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-medium tracking-tight text-white mb-6">
              On-device{" "}
              <span className="text-neutral-400">glasses detection</span> for
              modern web apps.
            </h1>
            <p className="text-lg text-neutral-400 mb-8 max-w-lg leading-relaxed">
              Real-time face attribute detection using landmarks and a
              lightweight ONNX model. Runs entirely in the browser or Node.js.
              Zero backend required.
            </p>
            <div className="flex flex-wrap gap-4">
              <button className="h-10 px-6 rounded-md bg-white text-black font-medium text-sm hover:bg-neutral-200 transition-colors flex items-center gap-2">
                <Terminal className="w-4 h-4" />
                {installCommand}
              </button>
              <a
                href="https://github.com/moraxh/FrameFind"
                className="h-10 px-6 rounded-md border border-neutral-700 bg-transparent text-white font-medium text-sm hover:bg-neutral-800 transition-colors flex items-center gap-2"
              >
                <GithubIcon className="w-4 h-4" />
                View Source
              </a>
            </div>
            <div className="mt-10 flex items-center gap-6 text-sm text-neutral-500">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-cyan-500" />
                <span>6.2MB Model</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-cyan-500" />
                <span>Sub-100ms Inference</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-cyan-500" />
                <span>WASM / WebGPU</span>
              </div>
            </div>
          </FadeIn>

          <FadeIn delay={0.1} className="w-full">
            <div className="rounded-xl border border-neutral-800 bg-[#111111] overflow-hidden">
              <div className="flex border-b border-neutral-800">
                {tabs.map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-5 py-2.5 text-xs font-mono transition-colors ${
                      activeTab === tab
                        ? "border-b border-cyan-400 text-white bg-white/5"
                        : "text-neutral-500 hover:text-neutral-300 hover:bg-white/[0.02]"
                    }`}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>
              <div className="relative bg-[#0d0d0d] min-h-[20rem] overflow-hidden">
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
                      language={HERO_EXAMPLES[activeTab].language}
                      code={HERO_EXAMPLES[activeTab].code}
                    />
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}
