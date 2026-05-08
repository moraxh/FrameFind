"use client";

import { Cpu, ShieldCheck, Terminal, Zap } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import {
	getInstallCommand,
	PACKAGE_MANAGERS,
	type PackageManager,
} from "@/lib/types";
import { CodeBlock } from "./CodeBlock";
import { FadeIn } from "./FadeIn";
import { GithubIcon } from "./GithubIcon";
import { TabSwitcher } from "./ui/TabSwitcher";

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
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const glasses   = useGlassesDetector({ enabled: true });
  const headPose  = useHeadPoseDetector({ enabled: true });
  const blink     = useBlinkDetector({ enabled: true });

  return (
    <div>
      <video ref={videoRef} autoPlay playsInline muted />
      <canvas ref={canvasRef} hidden />
      <p>Glasses: {glasses.result?.glasses ? 'yes' : 'no'}</p>
      <p>Yaw: {headPose.result?.yaw.toFixed(1)}°</p>
      <p>Blink: {blink.result?.blinking ? 'blinking' : 'open'}</p>
    </div>
  );
}`,
	},
	browser: {
		language: "typescript",
		code: `import { FrameFind } from '@framefind/core';

const ff = new FrameFind({
  detectors: ['glasses', 'headPose', 'blink'],
});

await ff.load();

const video  = document.querySelector('video')!;
const canvas = document.createElement('canvas');

video.addEventListener('play', () => {
  requestAnimationFrame(async function loop() {
    const result = await ff.detect(video, canvas);

    console.log('glasses:',  result.glasses);
    console.log('yaw:',      result.headPose?.yaw);
    console.log('blinking:', result.blink?.blinking);

    requestAnimationFrame(loop);
  });
});`,
	},
	node: {
		language: "typescript",
		code: `import { GlassesDetectorNode } from '@framefind/core/node';
import { HeadPoseDetectorNode } from '@framefind/core/node';

const glasses  = new GlassesDetectorNode({ modelPath: './models/glasses.onnx' });
const headPose = new HeadPoseDetectorNode();

await Promise.all([glasses.load(), headPose.load()]);

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

export function HeroSection() {
	const [versions, setVersions] = useState<Record<string, string>>({});
	const [activeTab, setActiveTab] = useState<HeroTab>("react");
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

	const installCommand = mounted
		? getInstallCommand(packageManager)
		: "npm install @framefind/core";
	const tabs: HeroTab[] = ["react", "browser", "node"];

	return (
		<section className="pt-24 pb-20 px-6">
			<div className="max-w-6xl mx-auto">
				<div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
					<FadeIn>
						{/* Package badges */}
						<div className="flex flex-wrap gap-2 mb-8">
							{PACKAGES.map((pkg) => {
								const shortName = pkg.name.replace("@framefind/", "");
								const version = versions[pkg.name];
								return (
									<a
										key={pkg.name}
										href={pkg.npm}
										target="_blank"
										rel="noopener noreferrer"
										className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-cyan-900/50 bg-cyan-950/20 text-cyan-400 text-[11px] font-mono tracking-wide hover:border-cyan-700/50 hover:bg-cyan-950/40 transition-colors"
									>
										<span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
										{shortName}
										{version ? ` v${version}` : ""}
									</a>
								);
							})}
						</div>

						{/* Headline */}
						<h1 className="text-4xl md:text-5xl lg:text-[3.25rem] font-semibold tracking-tight text-white mb-5 leading-[1.1]">
							On-device{" "}
							<span className="text-neutral-500">computer vision SDK</span>
							<br />
							for the web.
						</h1>

						<p className="text-base text-neutral-400 mb-8 max-w-md leading-relaxed">
							Modular face detectors — glasses, head pose, blink, attention,
							gaze, emotion — running fully local in the browser or Node.js via
							ONNX. Zero backend. Zero tracking.
						</p>

						{/* CTA row */}
						<div className="flex flex-wrap gap-3">
							<a
								href="#demo"
								className="h-10 px-5 rounded-md bg-cyan-500 hover:bg-cyan-600 text-white font-medium text-sm transition-colors flex items-center gap-2"
							>
								Try the live demo
							</a>
							<button
								type="button"
								onClick={() => {
									navigator.clipboard.writeText(installCommand);
								}}
								className="h-10 px-5 rounded-md bg-white text-black font-medium text-sm hover:bg-neutral-100 transition-colors flex items-center gap-2"
								aria-label="Copy install command"
							>
								<Terminal className="w-4 h-4" aria-hidden="true" />
								{installCommand}
							</button>
							<a
								href="https://github.com/moraxh/FrameFind"
								target="_blank"
								rel="noopener noreferrer"
								className="h-10 px-5 rounded-md border border-neutral-700 bg-transparent text-white font-medium text-sm hover:bg-neutral-900 transition-colors flex items-center gap-2"
							>
								<GithubIcon className="w-4 h-4" />
								View Source
							</a>
						</div>

						{/* Trust signals */}
						<div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-neutral-500">
							<div className="flex items-center gap-1.5">
								<ShieldCheck className="w-4 h-4 text-cyan-600" />
								<span>Privacy-first</span>
							</div>
							<div className="flex items-center gap-1.5">
								<Zap className="w-4 h-4 text-cyan-600" />
								<span>Sub-100ms inference</span>
							</div>
							<div className="flex items-center gap-1.5">
								<Cpu className="w-4 h-4 text-cyan-600" />
								<span>WASM · WebGPU · Node</span>
							</div>
						</div>
					</FadeIn>

					{/* Code panel */}
					<FadeIn delay={0.1} className="w-full">
						<div className="rounded-xl border border-neutral-800 bg-[#111111] overflow-hidden">
							<TabSwitcher
								tabs={tabs.map((t) => ({
									id: t,
									label: t.charAt(0).toUpperCase() + t.slice(1),
								}))}
								value={activeTab}
								onChange={setActiveTab}
								variant="underline"
								ariaLabel="Code example language"
								panelIdPrefix="hero-code"
							/>
							<div
								id={`hero-code-${activeTab}`}
								role="tabpanel"
								aria-labelledby={`tab-btn-hero-code-${activeTab}`}
								className="relative bg-[#0d0d0d] min-h-[22rem] overflow-hidden"
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
