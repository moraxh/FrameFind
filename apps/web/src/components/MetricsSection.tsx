import { FadeIn } from "./FadeIn";

const METRICS = [
  { label: "Detectors",      value: "7",        desc: "Modular, install only what you need" },
  { label: "Model Size",     value: "6.2MB",    desc: "Glasses model, cached after first load" },
  { label: "Inference Time", value: "<100ms",   desc: "Median on standard hardware" },
  { label: "Browser Support",value: "98%",      desc: "WASM · WebGL · WebGPU" },
  { label: "Memory",         value: "~45MB",    desc: "Runtime VRAM allocation" },
  { label: "Zero Backend",   value: "100%",     desc: "All inference runs on-device" },
];

export function MetricsSection() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <FadeIn>
          <div className="mb-12">
            <div className="text-[11px] font-mono text-cyan-500 uppercase tracking-widest mb-3">
              Performance
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-white mb-3">
              Engineered for the edge.
            </h2>
            <p className="text-neutral-400 text-sm">
              Benchmarks from real browser workloads.
            </p>
          </div>
        </FadeIn>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {METRICS.map((metric, i) => (
            <FadeIn key={metric.label} delay={i * 0.07}>
              <div className="p-5 rounded-xl border border-neutral-800 bg-[#111] flex flex-col gap-3">
                <div className="text-[11px] font-mono text-neutral-500 uppercase tracking-wide">
                  {metric.label}
                </div>
                <div className="text-2xl font-mono text-white tracking-tight leading-none">
                  {metric.value}
                </div>
                <div className="text-[11px] text-neutral-600 leading-relaxed">
                  {metric.desc}
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}
