import { FadeIn } from "./FadeIn";

const METRICS = [
  { label: "Model Size", value: "6.2MB", desc: "Cached after first load" },
  { label: "Inference Time", value: "<100ms", desc: "On standard hardware" },
  { label: "Memory Footprint", value: "~45MB", desc: "VRAM allocation" },
  { label: "Browser Support", value: "98%", desc: "WASM / WebGL / WebGPU" },
];

export function MetricsSection() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <FadeIn>
          <div className="mb-12">
            <h2 className="text-2xl font-medium tracking-tight text-white mb-3">
              Engineered for the edge
            </h2>
            <p className="text-neutral-400">
              Optimization metrics from production workloads.
            </p>
          </div>
        </FadeIn>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {METRICS.map((metric, i) => (
            <FadeIn key={metric.label} delay={i * 0.1}>
              <div className="p-6 rounded-xl border border-neutral-800 bg-[#111]">
                <div className="text-sm text-neutral-500 mb-4">{metric.label}</div>
                <div className="text-3xl font-mono text-white mb-2 tracking-tight">
                  {metric.value}
                </div>
                <div className="text-xs text-neutral-400">{metric.desc}</div>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}
