import { Eye, Layers, Target, Cpu, CheckCircle2, ArrowRight } from "lucide-react";
import { FadeIn } from "./FadeIn";

const STEPS = [
  { title: "Input media", desc: "Camera stream or image", icon: Eye },
  { title: "FaceMesh", desc: "Extract landmarks", icon: Layers },
  { title: "ROI Crop", desc: "Isolate eye region", icon: Target },
  { title: "ONNX inference", desc: "Local execution", icon: Cpu },
  { title: "Result", desc: "Smoothed probability", icon: CheckCircle2 },
];

export function PipelineSection() {
  return (
    <section className="py-24 px-6 bg-neutral-900/20 border-y border-neutral-800/40">
      <div className="max-w-6xl mx-auto">
        <FadeIn>
          <div className="mb-12">
            <h2 className="text-2xl font-medium tracking-tight text-white mb-3">
              How it works
            </h2>
            <p className="text-neutral-400">
              A lean, optimized pipeline utilizing ONNX Web Runtime.
            </p>
          </div>
        </FadeIn>
        <FadeIn delay={0.1}>
          <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
            {STEPS.map((step, i) => (
              <div
                key={step.title}
                className="flex flex-col lg:flex-row items-center gap-4 w-full lg:w-auto"
              >
                <div className="flex flex-col items-center text-center p-6 bg-[#111] border border-neutral-800 rounded-lg w-full lg:w-44 h-36 justify-center">
                  <step.icon className="w-6 h-6 text-neutral-300 mb-3" />
                  <span className="text-[13px] font-medium text-neutral-200 mb-1">
                    {step.title}
                  </span>
                  <span className="text-[11px] text-neutral-500">{step.desc}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <ArrowRight className="hidden lg:block w-5 h-5 text-neutral-700 shrink-0" />
                )}
              </div>
            ))}
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
