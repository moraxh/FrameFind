import { CheckCircle2, Circle } from "lucide-react";
import { FadeIn } from "./FadeIn";

const ROADMAP = [
  { label: "Glasses detection", active: true },
  { label: "Mask detection", active: false },
  { label: "Blink / drowsiness detection", active: false },
  { label: "Head pose estimation", active: false },
  { label: "Attention tracking", active: false },
  { label: "Iris gaze estimation", active: false },
];

export function RoadmapSection() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-16">
        <FadeIn>
          <div>
            <h2 className="text-2xl font-medium tracking-tight text-white mb-8">
              Future Roadmap
            </h2>
            <ul className="space-y-4">
              {ROADMAP.map((item) => (
                <li
                  key={item.label}
                  className="flex items-center justify-between p-4 rounded-lg border border-neutral-800 bg-[#111]"
                >
                  <span className={`text-sm ${item.active ? "text-white" : "text-neutral-400"}`}>
                    {item.label}
                  </span>
                  {item.active ? (
                    <CheckCircle2 className="w-4 h-4 text-cyan-500" />
                  ) : (
                    <Circle className="w-4 h-4 text-neutral-700" />
                  )}
                </li>
              ))}
            </ul>
          </div>
        </FadeIn>

        <FadeIn delay={0.1} className="lg:pl-8 lg:border-l border-neutral-800">
          <h2 className="text-2xl font-medium tracking-tight text-white mb-6">
            Philosophy
          </h2>
          <div className="prose prose-invert prose-p:text-neutral-400 prose-p:text-sm prose-p:leading-relaxed max-w-none">
            <p>
              <strong>Edge-first AI.</strong>{" "}The future of computer vision
              shouldn&apos;t be gated by API latency, network conditions, or
              cloud compute costs. By running targeted, lightweight models
              directly on the client, we unlock interfaces that were previously
              impossible.
            </p>
            <p>
              <strong>Privacy by design.</strong>{" "}When an application requires
              monitoring user attention, eye contact, or facial context, sending
              that media feed to a remote server is fundamentally hostile to
              privacy. On-device inference guarantees that pixels never leave the
              user&apos;s hardware.
            </p>
            <p>
              <strong>Pragmatic ML.</strong>{" "}Instead of loading a 100MB
              general-purpose vision model, FrameFind uses a tiered approach: an
              ultra-optimized landmark detector securely crops regions of
              interest, feeding them into tiny, specialized classification
              models.
            </p>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
