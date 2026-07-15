"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import {
  getInstallCommand as _getInstallCommand,
  PACKAGE_MANAGERS,
  type PackageManager,
} from "@/lib/types";
import { CodeBlock } from "./CodeBlock";
import { FadeIn } from "./FadeIn";
import { TabSwitcher } from "./ui/TabSwitcher";

type Tab = "react" | "browser" | "node";

const TAB_CODE: Record<Tab, { language: string; code: string }> = {
  react: {
    language: "tsx",
    code: `import { useRef, useEffect } from 'react';
import { useGlassesDetector, useBlinkDetector } from '@framefind/react';

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);

  const { result: glasses, loading } = useGlassesDetector({
    videoRef,
    threshold: 0.35,
  });

  const { result: blink } = useBlinkDetector({
    videoRef,
    onBlink: (ear)      => console.log('blink!', ear),
    onFaceLost: ()      => console.log('face lost'),
    onEARChange: (ear)  => console.log('ear:', ear),
  });

  useEffect(() => {
    let stream: MediaStream;
    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then((s) => {
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      });
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);

  return (
    <div className="max-w-sm p-4">
      <video ref={videoRef} autoPlay playsInline muted className="w-full" />
      {loading && <p>Loading model…</p>}
      {glasses && (
        <p>Glasses: {glasses.glasses ? 'Yes' : 'No'} ({(glasses.probability * 100).toFixed(1)}%)</p>
      )}
      {blink && (
        <>
          <p>State: {blink.isBlinking ? 'closed' : 'open'}</p>
          <p>EAR: {blink.smoothedEar?.toFixed(3) ?? '—'}</p>
          <p>Baseline: {blink.baselineEar?.toFixed(3) ?? '—'}</p>
        </>
      )}
    </div>
  );
}`,
  },
  browser: {
    language: "typescript",
    code: `import { GlassesDetector } from '@framefind/core';

const detector = new GlassesDetector({
  threshold: 0.35,       // default
  smoothingWindow: 8,    // frames averaged
  preferGpu: true,       // WebGL delegate
  inferenceIntervalMs: 0,
});

await detector.load();

const video = document.getElementById('camera') as HTMLVideoElement;
const canvas = document.createElement('canvas');

async function loop() {
  const result = await detector.detectFromVideoFrame(video, canvas);
  console.log('Glasses:', result.glasses);
  console.log('Probability:', result.probability);
  console.log('Face detected:', result.faceDetected);
  requestAnimationFrame(loop);
}

video.addEventListener('play', loop, { once: true });`,
  },
  node: {
    language: "typescript",
    code: `import { GlassesDetectorNode } from '@framefind/core/node';

const detector = new GlassesDetectorNode({
  threshold: 0.35,
  smoothingWindow: 8,
});

await detector.load();

// From an image file (requires 'sharp': npm i sharp)
const result = await detector.detectFromImagePath('./photo.jpg');

// Or from a raw RGBA Buffer
// const result = await detector.detectFromRgbaBuffer(rgbaBuffer);

console.log('Glasses:', result.glasses);
console.log('Confidence:', result.probability);

await detector.dispose();`,
  },
};

function getInstallCommand(pm: PackageManager, packages: string): string {
  return _getInstallCommand(pm, packages);
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
    mounted
      ? getInstallCommand(packageManager, packages)
      : `npm install ${packages}`;

  return (
    <section className="py-24 px-6">
      <div className="max-w-6xl mx-auto flex flex-col gap-16">
        <FadeIn>
          <div>
            <div className="text-[11px] font-mono text-cyan-500 uppercase tracking-widest mb-3">
              Quick start
            </div>
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-white mb-6">
              Up and running in minutes.
            </h2>
            <p className="text-sm text-neutral-400 mb-8 leading-relaxed">
              Three steps from install to first detection result.
            </p>

            {/* Step 1 */}
            <div className="flex gap-4 mb-8">
              <div className="flex-shrink-0 w-6 h-6 rounded-full border border-cyan-700 bg-cyan-950/30 flex items-center justify-center text-[10px] font-bold text-cyan-400 mt-0.5">
                1
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white mb-3">
                  Install packages
                </p>
                <div className="space-y-4">
                  <div className="flex items-center gap-1.5 mb-4 bg-neutral-900/50 p-1 w-fit rounded-lg border border-neutral-800">
                    {PACKAGE_MANAGERS.map((pm) => (
                      <button
                        key={pm}
                        type="button"
                        onClick={() => handleManagerChange(pm)}
                        aria-pressed={packageManager === pm}
                        className={`px-3 py-1.5 text-xs font-mono rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-cyan-400 ${
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
                      Core + React
                    </div>
                    <CodeBlock
                      code={cmd(
                        "@framefind/core @framefind/react onnxruntime-web",
                      )}
                      language="bash"
                    />
                  </div>
                  <div>
                    <div className="text-xs font-mono text-neutral-500 mb-2 uppercase tracking-wide">
                      Node.js
                    </div>
                    <CodeBlock
                      code={cmd("@framefind/core onnxruntime-node")}
                      language="bash"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex gap-4 mb-8">
              <div className="flex-shrink-0 w-6 h-6 rounded-full border border-cyan-700 bg-cyan-950/30 flex items-center justify-center text-[10px] font-bold text-cyan-400 mt-0.5">
                2
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white mb-3">
                  Initialize a detector
                </p>
                <CodeBlock
                  language="tsx"
                  code={`const { videoRef, result, loading } = useGlassesDetector();`}
                />
                <p className="text-xs text-neutral-500 mt-2">
                  Or use the vanilla API:{" "}
                  <code className="text-cyan-500">new GlassesDetector()</code>
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-6 h-6 rounded-full border border-cyan-700 bg-cyan-950/30 flex items-center justify-center text-[10px] font-bold text-cyan-400 mt-0.5">
                3
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white mb-3">
                  Read results in your render loop
                </p>
                <CodeBlock
                  language="tsx"
                  code={`if (result?.glasses) {
  console.log(\`Glasses! \${(result.probability * 100).toFixed(1)}% confidence\`);
}`}
                />
              </div>
            </div>
          </div>
        </FadeIn>

        <FadeIn delay={0.1}>
          <div className="bg-[#111111] border border-neutral-800 rounded-xl overflow-hidden h-auto my-auto flex flex-col">
            <TabSwitcher
              tabs={(["react", "browser", "node"] as const).map((t) => ({
                id: t,
                label: t.charAt(0).toUpperCase() + t.slice(1),
              }))}
              value={activeTab}
              onChange={setActiveTab}
              variant="underline"
              ariaLabel="Code example environment"
              panelIdPrefix="qs-code"
            />
            <div
              id={`qs-code-${activeTab}`}
              role="tabpanel"
              aria-labelledby={`tab-btn-qs-code-${activeTab}`}
              className="relative bg-[#0d0d0d] min-h-[22rem] overflow-x-auto"
            >
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
