import { FadeIn } from "./FadeIn";
import { Video, Crosshair, Crop, Cpu, BarChart2 } from "lucide-react";

interface PipelineStep {
  icon: React.ElementType;
  label: string;
  sublabel: string;
}

const STEPS: PipelineStep[] = [
  { icon: Video,      label: "Video Frame",        sublabel: "Camera · Image · Node" },
  { icon: Crosshair,  label: "MediaPipe",           sublabel: "468 facial landmarks" },
  { icon: Crop,       label: "ROI Crop",            sublabel: "Eye · Face region" },
  { icon: Cpu,        label: "ONNX Inference",      sublabel: "WASM · WebGPU" },
  { icon: BarChart2,  label: "Result",              sublabel: "Probability · Angles" },
];

export function PipelineDiagramSection() {
  return (
    <section className="py-20 sm:py-24 px-6" aria-labelledby="pipeline-heading">
      <div className="max-w-5xl mx-auto">
        <FadeIn>
          <div className="text-center mb-14">
            <p className="text-sm font-mono text-cyan-400 mb-3 tracking-wider uppercase">How it works</p>
            <h2 id="pipeline-heading" className="text-3xl sm:text-4xl font-bold text-white">
              Frame-to-result in milliseconds
            </h2>
            <p className="mt-4 text-neutral-400 max-w-xl mx-auto">
              Everything runs locally. No cloud round-trip. No raw video ever leaves the browser.
            </p>
          </div>
        </FadeIn>

        <FadeIn delay={0.1}>
          {/* Desktop: horizontal flow */}
          <div className="hidden sm:flex items-center justify-between gap-2" role="list" aria-label="Detection pipeline steps">
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <div key={step.label} className="flex items-center gap-2 flex-1 min-w-0">
                  <div role="listitem" className="flex flex-col items-center text-center flex-1 min-w-0">
                    <div className="w-12 h-12 rounded-xl border border-neutral-700 bg-neutral-900 flex items-center justify-center mb-3 flex-shrink-0">
                      <Icon className="w-5 h-5 text-cyan-400" aria-hidden="true" />
                    </div>
                    <p className="text-sm font-semibold text-white truncate w-full">{step.label}</p>
                    <p className="text-xs text-neutral-500 mt-0.5 truncate w-full">{step.sublabel}</p>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className="flex-shrink-0 flex flex-col items-center" aria-hidden="true">
                      <div className="w-8 h-px bg-neutral-700 relative">
                        <span className="absolute -right-1 -top-1.5 text-neutral-600 text-xs">›</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Mobile: vertical flow */}
          <ol className="sm:hidden space-y-3">
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <li key={step.label}>
                  <div className="flex items-center gap-4 p-4 rounded-xl border border-neutral-800 bg-neutral-900/50">
                    <div className="w-10 h-10 rounded-lg border border-neutral-700 bg-neutral-900 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-4 h-4 text-cyan-400" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{step.label}</p>
                      <p className="text-xs text-neutral-500">{step.sublabel}</p>
                    </div>
                    {i < STEPS.length - 1 && (
                      <span className="ml-auto text-neutral-600 text-lg" aria-hidden="true">↓</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </FadeIn>

        <FadeIn delay={0.2}>
          <div className="mt-12 grid sm:grid-cols-3 gap-4 text-center">
            {[
              { value: "~27ms", label: "median inference" },
              { value: "0 bytes", label: "data sent to server" },
              { value: "6.2MB", label: "glasses model" },
            ].map(({ value, label }) => (
              <div key={label} className="p-4 rounded-xl border border-neutral-800 bg-neutral-900/30">
                <p className="text-2xl font-bold text-white font-mono">{value}</p>
                <p className="text-sm text-neutral-500 mt-1">{label}</p>
              </div>
            ))}
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
