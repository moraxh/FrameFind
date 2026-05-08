import { Zap, Lock, Box } from "lucide-react";
import { FadeIn } from "./FadeIn";

const PROBLEMS = [
  {
    icon: Zap,
    title: "Cloud latency kills real-time UX",
    desc: "Sending 30fps over the network to cloud APIs causes severe lag. On-device inference delivers sub-100ms feedback with zero round-trips.",
  },
  {
    icon: Lock,
    title: "Face data shouldn't leave the device",
    desc: "Transmitting user face data to servers creates GDPR/CCPA overhead and erodes user trust. FrameFind guarantees data never leaves the browser.",
  },
  {
    icon: Box,
    title: "Existing SDKs are bloated monoliths",
    desc: "Traditional ML suites ship massive, monolithic runtimes. FrameFind is modular — each detector is a separate package. Install only what you use.",
  },
];

export function ProblemSection() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <FadeIn>
          <div className="text-[11px] font-mono text-cyan-500 uppercase tracking-widest mb-3">
            Why FrameFind
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-white mb-12">
            The problem with existing APIs.
          </h2>
        </FadeIn>
        <div className="grid md:grid-cols-3 gap-6">
          {PROBLEMS.map((problem, i) => (
            <FadeIn key={problem.title} delay={i * 0.08}>
              <div className="p-6 rounded-xl border border-neutral-800/60 bg-neutral-900/20">
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
