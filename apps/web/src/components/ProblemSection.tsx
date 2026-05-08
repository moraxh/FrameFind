import { Zap, Lock, Box } from "lucide-react";
import { FadeIn } from "./FadeIn";

const PROBLEMS = [
  {
    icon: Zap,
    title: "Cloud Latency is Too High",
    desc: "Sending 30 frames per second over the network to cloud APIs causes severe lag. Edge-inference guarantees sub-100ms real-time feedback.",
  },
  {
    icon: Lock,
    title: "Privacy & Compliance",
    desc: "Transmitting user face data to servers creates enormous GDPR/CCPA overhead. On-device inference means data never leaves the browser.",
  },
  {
    icon: Box,
    title: "Bloated Dependencies",
    desc: "Traditional ML suites export massive WASM bundles. FrameFind uses targeted MediaPipe landmark indices and a specialized 6.2MB model.",
  },
];

export function ProblemSection() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <FadeIn>
          <h2 className="text-2xl font-medium tracking-tight text-white mb-12">
            The problem with existing APIs
          </h2>
        </FadeIn>
        <div className="grid md:grid-cols-3 gap-8">
          {PROBLEMS.map((problem, i) => (
            <FadeIn key={problem.title} delay={i * 0.1}>
              <div className="p-6 rounded-xl border border-neutral-800/60 bg-neutral-900/30">
                <div className="w-10 h-10 rounded-lg border border-neutral-700 bg-neutral-800 flex items-center justify-center mb-5">
                  <problem.icon className="w-5 h-5 text-neutral-300" />
                </div>
                <h3 className="text-base font-medium text-white mb-2">
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
