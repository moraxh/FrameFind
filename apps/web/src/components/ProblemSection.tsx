import { Zap, Lock, Box, Cloud } from "lucide-react";
import { FadeIn } from "./FadeIn";

const PROBLEMS = [
  {
    icon: Zap,
    title: "Real-time interaction needs local feedback",
    desc: "A network round-trip on every frame adds latency where it matters most. Local inference keeps feedback immediate and responsive.",
  },
  {
    icon: Lock,
    title: "Camera data deserves a smaller surface",
    desc: "FrameFind processes video in the browser or on your server-side runtime. Raw camera frames are not sent to a FrameFind service.",
  },
  {
    icon: Box,
    title: "Use only the signals you need",
    desc: "Detectors are modular and runtimes remain peer dependencies, so you can choose the browser or Node.js path that fits your application.",
  },
  {
    icon: Cloud,
    title: "A small, typed integration",
    desc: "Use the core classes directly or start with the React hooks. Every detector returns predictable typed results with faceDetected and confidence data.",
  },
];

export function ProblemSection() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <FadeIn>
          <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.2em] text-[#e87148]">
            Frame 03 / Why FrameFind
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-white mb-12">
            A clearer foundation for camera features.
          </h2>
        </FadeIn>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {PROBLEMS.map((problem, i) => (
            <FadeIn key={problem.title} delay={i * 0.08} className="h-full">
              <div className="p-6 rounded-xl border border-white/[0.08] bg-neutral-900/40 hover:border-cyan-500/25 transition-colors h-full flex flex-col">
                <div className="w-9 h-9 rounded-lg border border-neutral-700 bg-neutral-800 flex items-center justify-center mb-5">
                  <problem.icon className="w-4 h-4 text-neutral-300" />
                </div>
                <h3 className="text-sm font-semibold text-white mb-2">
                  {problem.title}
                </h3>
                <p className="text-sm text-neutral-400 leading-relaxed">
                  {problem.desc}
                </p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}
