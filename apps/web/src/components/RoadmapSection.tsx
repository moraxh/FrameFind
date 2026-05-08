import { FadeIn } from "@/components/FadeIn";
import { CheckCircle2, Clock, Circle } from "lucide-react";

type PhaseStatus = "shipped" | "in-progress" | "planned";

interface PhaseItem {
  title: string;
  description: string;
  items: string[];
  status: PhaseStatus;
}

const phases: PhaseItem[] = [
  {
    title: "Phase 1 — MVP",
    description: "Core runtime and first production detectors.",
    items: ["Glasses detector (ONNX, WASM + WebGPU)", "Head pose via MediaPipe solvePnP", "React hooks (useGlassesDetector, useHeadPoseDetector)", "Browser + Node.js runtime", "CDN model streaming — zero bundle cost"],
    status: "shipped",
  },
  {
    title: "Phase 2 — Expansion",
    description: "New detectors, worker-thread inference, WebGPU-first.",
    items: ["Blink detection (EAR geometric, ultra-fast)", "Attention detection (heuristic + sequence model)", "Mask detector (MobileNetV3)", "Gaze estimation (MediaPipe Iris → geometric vector)", "Worker thread runtime — inference off main thread", "WebGPU-first execution provider"],
    status: "in-progress",
  },
  {
    title: "Phase 3 — Platform",
    description: "Multi-task models, scheduling, enterprise tooling.",
    items: ["Shared encoder + multiple heads (lower latency)", "Adaptive frame scheduler per detector", "Emotion detector (neutral / happy / sad / angry / surprised)", "Advanced temporal engine (smoothing, hysteresis, events)", "Enterprise support + custom model pipeline", "Detector marketplace"],
    status: "planned",
  },
];

const statusConfig: Record<PhaseStatus, { label: string; icon: React.ReactNode; pill: string; line: string }> = {
  shipped: {
    label: "Shipped",
    icon: <CheckCircle2 className="w-5 h-5 text-emerald-400" aria-hidden="true" />,
    pill: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
    line: "bg-emerald-500/40",
  },
  "in-progress": {
    label: "In Progress",
    icon: <Clock className="w-5 h-5 text-cyan-400" aria-hidden="true" />,
    pill: "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30",
    line: "bg-cyan-500/40",
  },
  planned: {
    label: "Planned",
    icon: <Circle className="w-5 h-5 text-neutral-500" aria-hidden="true" />,
    pill: "bg-neutral-800 text-neutral-400 border border-neutral-700",
    line: "bg-neutral-700",
  },
};

export function RoadmapSection() {
  return (
    <section id="roadmap" className="py-20 sm:py-28" aria-labelledby="roadmap-heading">
      <div className="max-w-4xl mx-auto px-6">
        <FadeIn>
          <div className="text-center mb-16">
            <p className="text-sm font-mono text-cyan-400 mb-3 tracking-wider uppercase">Roadmap</p>
            <h2 id="roadmap-heading" className="text-3xl sm:text-4xl font-bold text-white">
              What&apos;s shipping next
            </h2>
            <p className="mt-4 text-neutral-400 max-w-xl mx-auto">
              Three phases from core runtime to full-platform face intelligence.
            </p>
          </div>
        </FadeIn>

        <div className="relative">
          {/* Vertical connector line */}
          <div className="absolute left-6 top-8 bottom-8 w-px bg-neutral-800" aria-hidden="true" />

          <ol className="space-y-12">
            {phases.map((phase, i) => {
              const cfg = statusConfig[phase.status];
              return (
                <li key={phase.title}>
                  <FadeIn delay={i * 0.1}>
                    <div className="flex gap-6">
                      {/* Node */}
                      <div className="relative flex-shrink-0 flex items-start pt-1 z-10">
                        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-neutral-900 border border-neutral-800">
                          {cfg.icon}
                        </div>
                      </div>

                      {/* Content */}
                      <div className="flex-1 pb-2">
                        <div className="flex flex-wrap items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-white">{phase.title}</h3>
                          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${cfg.pill}`} aria-label={`Status: ${cfg.label}`}>
                            {cfg.label}
                          </span>
                        </div>
                        <p className="text-neutral-400 text-sm mb-4">{phase.description}</p>
                        <ul className="space-y-2" aria-label={`${phase.title} deliverables`}>
                          {phase.items.map((item) => (
                            <li key={item} className="flex items-start gap-2 text-sm text-neutral-300">
                              <span className={`mt-1.5 flex-shrink-0 w-1.5 h-1.5 rounded-full ${cfg.line}`} aria-hidden="true" />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </FadeIn>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
