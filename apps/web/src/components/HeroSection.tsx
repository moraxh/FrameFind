"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, Copy, Cpu, ShieldCheck, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  getInstallCommand,
  PACKAGE_MANAGERS,
  type PackageManager,
} from "@/lib/types";
import { CodeBlock } from "./CodeBlock";
import { FadeIn } from "./FadeIn";
import { GithubIcon } from "./GithubIcon";

type HeroTab = "react" | "browser" | "node";

const HERO_EXAMPLES: Record<HeroTab, { language: string; code: string }> = {
  react: {
    language: "tsx",
    code: `import { useRef } from 'react';
import {
  useGlassesDetector,
  useHeadPoseDetector,
  useBlinkDetector,
} from '@framefind/react';

export function App() {
  const videoRef = useRef(null);

  const glasses  = useGlassesDetector({ videoRef });
  const headPose = useHeadPoseDetector({ videoRef });
  const blink    = useBlinkDetector({
    videoRef,
    onBlink: (ear) => console.log('blink!', ear),
    onFaceLost: () => console.log('face lost'),
  });

  return (
    <div>
      <video ref={videoRef} autoPlay playsInline muted />
      {glasses.loading && <p>Loading…</p>}
      {glasses.result  && <p>Glasses: {glasses.result.glasses ? 'yes' : 'no'}</p>}
      {headPose.result && <p>Yaw: {headPose.result.yaw.toFixed(1)}°</p>}
      {blink.state     && <p>Blinking: {blink.state.isBlinking ? 'yes' : 'no'}</p>}
    </div>
  );
}`,
  },
  browser: {
    language: "typescript",
    code: `import { GlassesDetector, HeadPoseDetector, BlinkDetector } from '@framefind/core';

const glasses  = new GlassesDetector();
const headPose = new HeadPoseDetector();
const blink    = new BlinkDetector();

await Promise.all([glasses.load(), headPose.load(), blink.load()]);

const video  = document.querySelector('video')!;
const canvas = document.createElement('canvas');

blink.setCallbacks({
  onBlink:    (ear) => console.log('blink!', ear),
  onFaceLost: ()    => console.log('face lost'),
});

function loop() {
  const gResult = await glasses.detectFromVideoFrame(video, canvas);
  const hResult = headPose.detectFromVideo(video);
  blink.processFrame(video);

  console.log('glasses:', gResult.glasses);
  console.log('yaw:',     hResult.yaw);
  console.log('ear:',     blink.smoothedEarValue);

  requestAnimationFrame(loop);
}

video.addEventListener('play', loop, { once: true });`,
  },
  node: {
    language: "typescript",
    code: `import { GlassesDetectorNode, HeadPoseDetectorNode } from '@framefind/core/node';

const glasses  = new GlassesDetectorNode();
const headPose = new HeadPoseDetectorNode();

await Promise.all([glasses.load(), headPose.load()]);

// Requires 'sharp': npm i sharp
const [gResult, hResult] = await Promise.all([
  glasses.detectFromImagePath('./photo.jpg'),
  headPose.detectFromImagePath('./photo.jpg'),
]);

console.log('Glasses:',    gResult.glasses);
console.log('Confidence:', gResult.probability);
console.log('Yaw:',        hResult.yaw);

await Promise.all([glasses.dispose(), headPose.dispose()]);`,
  },
};

const INSTALL_TARGETS = [
  {
    id: "web",
    label: "Browser / React",
    packages: "@framefind/core @framefind/react",
  },
  {
    id: "node",
    label: "Node.js",
    packages: "@framefind/core onnxruntime-node",
  },
] as const;

type InstallTarget = (typeof INSTALL_TARGETS)[number]["id"];

const PACKAGES = [
  {
    name: "@framefind/core",
    npm: "https://www.npmjs.com/package/@framefind/core",
  },
  {
    name: "@framefind/react",
    npm: "https://www.npmjs.com/package/@framefind/react",
  },
  {
    name: "@framefind/utils",
    npm: "https://www.npmjs.com/package/@framefind/utils",
  },
];

async function fetchVersion(pkg: string): Promise<string | null> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${pkg}/latest`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.version ?? null;
  } catch {
    return null;
  }
}

function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "copied">("idle");

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setState("copied");
    setTimeout(() => setState("idle"), 2000);
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="flex-shrink-0 p-1.5 rounded-md text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800 transition-colors"
      title="Copy"
    >
      <AnimatePresence mode="wait" initial={false}>
        {state === "copied" ? (
          <motion.span
            key="check"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <Check className="w-3.5 h-3.5 text-cyan-400" />
          </motion.span>
        ) : (
          <motion.span
            key="copy"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <Copy className="w-3.5 h-3.5" />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

export function HeroSection() {
  const [versions, setVersions] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<HeroTab>("react");
  const [installTarget, setInstallTarget] = useState<InstallTarget>("web");
  const [packageManager, setPackageManager] = useState<PackageManager>("npm");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("packageManager") as PackageManager;
    if (PACKAGE_MANAGERS.includes(saved)) setPackageManager(saved);

    Promise.all(
      PACKAGES.map(async (pkg) => {
        const v = await fetchVersion(pkg.name);
        return [pkg.name, v] as const;
      }),
    ).then((results) => {
      const map: Record<string, string> = {};
      for (const [name, v] of results) {
        if (v) map[name] = v;
      }
      setVersions(map);
    });
  }, []);

  const handleManagerChange = (pm: PackageManager) => {
    setPackageManager(pm);
    localStorage.setItem("packageManager", pm);
  };

  const getCmd = (packages: string) =>
    mounted
      ? getInstallCommand(packageManager, packages)
      : `npm install ${packages}`;

  const activeInstall = INSTALL_TARGETS.find((t) => t.id === installTarget)!;
  const installCmd = getCmd(activeInstall.packages);

  const heroTabs: HeroTab[] = ["react", "browser", "node"];

  return (
    <section className="pt-28 pb-24 px-6">
      <div className="max-w-6xl mx-auto">
        {/* Top — centered headline block */}
        <FadeIn>
          <div className="text-center mb-16">
            {/* Badge row */}
            <div className="flex flex-wrap justify-center gap-2 mb-8">
              {PACKAGES.map((pkg) => {
                const shortName = pkg.name.replace("@framefind/", "");
                const version = versions[pkg.name];
                return (
                  <a
                    key={pkg.name}
                    href={pkg.npm}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-cyan-900/40 bg-cyan-950/20 text-cyan-400 text-[11px] font-mono tracking-wide hover:border-cyan-700/50 hover:bg-cyan-950/40 transition-colors"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
                    {shortName}
                    {version ? ` v${version}` : ""}
                  </a>
                );
              })}
            </div>

            {/* Headline */}
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-semibold tracking-tight text-white mb-5 leading-[1.05]">
              On-device face detection
              <br />
              <span className="text-neutral-500">for the web.</span>
            </h1>

            <p className="text-base md:text-lg text-neutral-400 mb-10 max-w-xl mx-auto leading-relaxed">
              Glasses, head pose, blink — running fully local in the browser or
              Node.js via ONNX. Zero backend. Zero tracking.
            </p>

            {/* CTA row */}
            <div className="flex flex-wrap justify-center gap-3 mb-10">
              <a
                href="#demo"
                className="h-10 px-6 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-white font-medium text-sm transition-colors flex items-center gap-2"
              >
                Try the live demo
              </a>
              <a
                href="https://github.com/moraxh/FrameFind"
                target="_blank"
                rel="noopener noreferrer"
                className="h-10 px-6 rounded-lg border border-neutral-700 bg-transparent text-white font-medium text-sm hover:bg-neutral-900 hover:border-neutral-600 transition-colors flex items-center gap-2"
              >
                <GithubIcon className="w-4 h-4" />
                GitHub
              </a>
            </div>

            {/* Trust signals */}
            <div className="flex flex-wrap justify-center items-center gap-x-6 gap-y-2 text-sm text-neutral-600">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-neutral-600" />
                <span>Privacy-first</span>
              </div>
              <span className="hidden sm:block text-neutral-800">·</span>
              <div className="flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-neutral-600" />
                <span>Sub-100ms inference</span>
              </div>
              <span className="hidden sm:block text-neutral-800">·</span>
              <div className="flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-neutral-600" />
                <span>WASM · WebGPU · Node</span>
              </div>
            </div>
          </div>
        </FadeIn>

        {/* Bottom — unified code + install card */}
        <FadeIn delay={0.12}>
          <div className="rounded-2xl border border-neutral-800 bg-[#0f0f0f] overflow-hidden shadow-2xl shadow-black/40">
            {/* Card header: code tabs left, env tabs right */}
            <div className="flex items-center justify-between border-b border-neutral-800 bg-[#0a0a0a]">
              {/* Code example tabs */}
              <div role="tablist" aria-label="Code example" className="flex">
                {heroTabs.map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === t}
                    onClick={() => setActiveTab(t)}
                    className={`px-5 py-3 text-xs font-mono transition-colors border-b-2 ${
                      activeTab === t
                        ? "border-cyan-400 text-white bg-white/[0.03]"
                        : "border-transparent text-neutral-500 hover:text-neutral-300 hover:bg-white/[0.02]"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {/* Window dots */}
              <div className="hidden sm:flex items-center gap-1.5 px-4">
                <div className="w-2.5 h-2.5 rounded-full bg-neutral-800" />
                <div className="w-2.5 h-2.5 rounded-full bg-neutral-800" />
                <div className="w-2.5 h-2.5 rounded-full bg-neutral-800" />
              </div>
            </div>

            {/* Code body */}
            <div className="relative min-h-[22rem] bg-[#0d0d0d]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.16 }}
                >
                  <CodeBlock
                    plain
                    language={HERO_EXAMPLES[activeTab].language}
                    code={HERO_EXAMPLES[activeTab].code}
                  />
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Install strip */}
            <div className="border-t border-neutral-800 bg-[#0a0a0a]">
              {/* Install header */}
              <div className="flex items-center justify-between px-4 pt-3 pb-2 gap-3 flex-wrap">
                <div className="flex items-center gap-1 bg-neutral-900 rounded-lg p-0.5 border border-neutral-800">
                  {INSTALL_TARGETS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setInstallTarget(t.id)}
                      aria-pressed={installTarget === t.id}
                      className={`px-3 py-1 text-xs font-mono rounded-md transition-colors ${
                        installTarget === t.id
                          ? "bg-neutral-800 text-white"
                          : "text-neutral-500 hover:text-neutral-300"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1 bg-neutral-900 rounded-lg p-0.5 border border-neutral-800">
                  {PACKAGE_MANAGERS.map((pm) => (
                    <button
                      key={pm}
                      type="button"
                      onClick={() => handleManagerChange(pm)}
                      aria-pressed={packageManager === pm}
                      className={`px-2.5 py-1 text-xs font-mono rounded-md transition-colors ${
                        packageManager === pm
                          ? "bg-neutral-800 text-white"
                          : "text-neutral-500 hover:text-neutral-300"
                      }`}
                    >
                      {pm}
                    </button>
                  ))}
                </div>
              </div>

              {/* Install command row */}
              <div className="px-4 pb-4">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${installTarget}-${packageManager}`}
                    initial={{ opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.12 }}
                    className="flex items-center gap-2 bg-neutral-900/60 border border-neutral-800 rounded-lg px-4 py-2.5"
                  >
                    <span className="text-cyan-600 font-mono text-sm select-none">
                      $
                    </span>
                    <code className="flex-1 font-mono text-sm text-neutral-200 truncate">
                      {installCmd}
                    </code>
                    <CopyButton text={installCmd} />
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
