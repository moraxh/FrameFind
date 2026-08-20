import { FadeIn } from "./FadeIn";
import {
  BookOpen,
  Stethoscope,
  Gamepad2,
  Accessibility,
  Car,
  Video,
} from "lucide-react";

interface UseCase {
  icon: React.ElementType;
  industry: string;
  signal: string;
  example: string;
}

const USE_CASES: UseCase[] = [
  {
    icon: BookOpen,
    industry: "EdTech",
    signal: "Study interfaces",
    example:
      "Build optional gaze and blink signals into learning tools without uploading classroom video.",
  },
  {
    icon: Stethoscope,
    industry: "Telemedicine",
    signal: "Remote assessments",
    example:
      "Use local face signals to support guided assessments while keeping sensitive video on the device.",
  },
  {
    icon: Gamepad2,
    industry: "Gaming",
    signal: "Hands-free controls",
    example:
      "Turn gaze and head pose into lightweight interaction signals for browser-based experiences.",
  },
  {
    icon: Accessibility,
    industry: "Accessibility",
    signal: "Accessible interfaces",
    example:
      "Prototype gaze-assisted navigation and alternative controls with a local processing path.",
  },
  {
    icon: Car,
    industry: "Automotive",
    signal: "Attention-aware tools",
    example:
      "Explore blink, gaze and head-pose signals in controlled, user-consented interfaces.",
  },
  {
    icon: Video,
    industry: "Video Conferencing",
    signal: "Meeting experiences",
    example:
      "Add optional presence and interaction cues without making raw video part of your backend.",
  },
];

export function UseCasesSection() {
  return (
    <section className="py-24 px-6" aria-labelledby="usecases-heading">
      <div className="max-w-6xl mx-auto">
        <FadeIn>
          <div className="text-center mb-14">
            <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.2em] text-[#e87148]">
              Frame 06 / Use cases
            </p>
            <h2
              id="usecases-heading"
              className="text-3xl md:text-4xl font-semibold tracking-tight text-white"
            >
              Signals that fit real products.
            </h2>
            <p className="mt-4 text-neutral-400 max-w-xl mx-auto">
              Use the detector that matches your interface, with a processing model that respects the camera frame.
            </p>
          </div>
        </FadeIn>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {USE_CASES.map((uc, i) => {
            const Icon = uc.icon;
            return (
              <FadeIn key={uc.industry} delay={i * 0.07}>
                <article
                  className="p-6 rounded-xl border border-white/[0.08] bg-neutral-900/30 hover:border-cyan-500/25 hover:bg-neutral-900/50 transition-colors"
                  aria-label={`${uc.industry}: ${uc.signal}`}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="w-10 h-10 rounded-lg border border-neutral-700 bg-neutral-900 flex items-center justify-center flex-shrink-0"
                      aria-hidden="true"
                    >
                      <Icon
                        className="w-5 h-5 text-cyan-400"
                        aria-hidden="true"
                      />
                    </div>
                    <div>
                      <p className="text-xs font-mono text-neutral-500 uppercase tracking-wide">
                        {uc.industry}
                      </p>
                      <p className="text-sm font-semibold text-white">
                        {uc.signal}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm text-neutral-400 leading-relaxed">
                    {uc.example}
                  </p>
                </article>
              </FadeIn>
            );
          })}
        </div>
      </div>
    </section>
  );
}
