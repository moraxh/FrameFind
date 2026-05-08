import { FadeIn } from "./FadeIn";

export function ArchitectureSection() {
  return (
    <section className="py-24 px-6 bg-[#0d0d0d] border-y border-neutral-800/40">
      <div className="max-w-4xl mx-auto text-center">
        <FadeIn>
          <h2 className="text-2xl font-medium tracking-tight text-white mb-6">
            Architecture
          </h2>
          <div className="p-8 rounded-xl border border-neutral-800 bg-neutral-900/50">
            <div className="flex flex-col items-center gap-6">
              <div className="px-6 py-3 border border-neutral-700 bg-neutral-800 rounded-md text-sm text-neutral-200 font-mono w-48 text-center">
                User Media / Image
              </div>
              <div className="flex flex-col items-center">
                <div className="w-px h-6 bg-neutral-700" />
                <div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-neutral-700" />
              </div>
              <div className="p-4 border border-cyan-900/50 bg-cyan-950/20 rounded-lg w-full max-w-sm">
                <div className="text-xs uppercase tracking-widest text-cyan-500 mb-4">
                  FrameFind Core
                </div>
                <div className="space-y-2">
                  <div className="p-2 border border-neutral-700 bg-[#111] rounded text-xs text-neutral-300">
                    MediaPipe FaceMesh (WASM)
                  </div>
                  <div className="p-2 border border-neutral-700 bg-[#111] rounded text-xs text-neutral-300">
                    ROI Tensor Extraction
                  </div>
                  <div className="p-2 border border-neutral-700 bg-[#111] rounded text-xs text-neutral-300">
                    ONNX WebGPU Inference
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-center">
                <div className="w-px h-6 bg-neutral-700" />
                <div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-neutral-700" />
              </div>
              <div className="px-6 py-3 border border-green-900/50 bg-green-950/20 rounded-md text-sm text-green-400 font-mono w-48 text-center">
                boolean: hasGlasses
              </div>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
