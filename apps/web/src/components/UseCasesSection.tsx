import { FadeIn } from "./FadeIn";
import { BookOpen, Stethoscope, Gamepad2, Accessibility, Car, Video } from "lucide-react";

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
    signal: "Attention monitoring",
    example: "Detect when a student looks away from the screen to flag disengagement.",
  },
  {
    icon: Stethoscope,
    industry: "Telemedicine",
    signal: "Fatigue detection",
    example: "Monitor blink rate and head drooping to alert fatigued healthcare workers.",
  },
  {
    icon: Gamepad2,
    industry: "Gaming",
    signal: "Gaze & head tracking",
    example: "Use head pose as a no-controller input for hands-free interaction.",
  },
  {
    icon: Accessibility,
    industry: "Accessibility",
    signal: "Eye tracking UI",
    example: "Navigate interfaces by gaze for users with limited motor control.",
  },
  {
    icon: Car,
    industry: "Automotive",
    signal: "Drowsiness alerts",
    example: "Detect microsleeps and distraction in driver-assistance systems.",
  },
  {
    icon: Video,
    industry: "Video Conferencing",
    signal: "Engagement scoring",
    example: "Surface attention signals to meeting software without uploading video.",
  },
];

export function UseCasesSection() {
  return (
    <section className="py-24 px-6" aria-labelledby="usecases-heading">
      <div className="max-w-6xl mx-auto">
        <FadeIn>
          <div className="text-center mb-14">
            <p className="text-[11px] font-mono text-cyan-500 uppercase tracking-widest mb-3">Use cases</p>
            <h2 id="usecases-heading" className="text-3xl md:text-4xl font-semibold tracking-tight text-white">
              Built for real applications
            </h2>
            <p className="mt-4 text-neutral-400 max-w-xl mx-auto">
              Face signals unlock new interactions across industries — without sending data to a cloud.
            </p>
          </div>
        </FadeIn>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {USE_CASES.map((uc, i) => {
            const Icon = uc.icon;
            return (
              <FadeIn key={uc.industry} delay={i * 0.07}>
                <article
                  className="p-6 rounded-xl border border-neutral-800 bg-neutral-900/30 hover:border-neutral-700 hover:bg-neutral-900/50 transition-colors"
                  aria-label={`${uc.industry}: ${uc.signal}`}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg border border-neutral-700 bg-neutral-900 flex items-center justify-center flex-shrink-0" aria-hidden="true">
                      <Icon className="w-5 h-5 text-cyan-400" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-xs font-mono text-neutral-500 uppercase tracking-wide">{uc.industry}</p>
                      <p className="text-sm font-semibold text-white">{uc.signal}</p>
                    </div>
                  </div>
                  <p className="text-sm text-neutral-400 leading-relaxed">{uc.example}</p>
                </article>
              </FadeIn>
            );
          })}
        </div>
      </div>
    </section>
  );
}
