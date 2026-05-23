"use client";

import {
  Glasses,
  Navigation,
  Eye,
  Brain,
  Scan,
  ShieldCheck,
  ShieldOff,
  Heart,
  Mic,
} from "lucide-react";
import { FadeIn } from "./FadeIn";
import { motion } from "motion/react";

type DetectorStatus = "live" | "phase2" | "phase3";

interface Detector {
  id: string;
  icon: React.ElementType;
  name: string;
  status: DetectorStatus;
  pkg: string;
  desc: string;
  detail: string;
}

const LIVE_DETECTORS: Detector[] = [
  {
    id: "glasses",
    icon: Glasses,
    name: "Glasses",
    status: "live",
    pkg: "@framefind/core",
    desc: "Detect eyewear presence with confidence score",
    detail: "Eye-region crop → 6.2MB ONNX classifier → smoothed probability",
  },
  {
    id: "headpose",
    icon: Navigation,
    name: "Head Pose",
    status: "live",
    pkg: "@framefind/core",
    desc: "Real-time yaw, pitch, and roll estimation",
    detail: "MediaPipe landmarks → solvePnP → ZYX Euler angles",
  },
  {
    id: "blink",
    icon: Eye,
    name: "Blink",
    status: "live",
    pkg: "@framefind/core",
    desc: "Multi-signal blink detection with per-eye self-calibration",
    detail: "Blendshapes + EAR geometry + asymmetry → drop-rate gate → blink event",
  },
  {
    id: "mask",
    icon: ShieldOff,
    name: "Mask",
    status: "live",
    pkg: "@framefind/core",
    desc: "Three-way face-mask classifier with on-device inference",
    detail: "Face-bbox crop → 112×112 ONNX classifier → softmax(with/without/incorrect)",
  },
  {
    id: "gaze",
    icon: Scan,
    name: "Gaze",
    status: "live",
    pkg: "@framefind/core",
    desc: "Iris-based gaze direction with 3×3 screen region mapping",
    detail: "Iris landmarks → eye-bbox ratio → head-pose compensation → gaze vector + region",
  },
];

const ROADMAP_DETECTORS: Detector[] = [
  {
    id: "liveness",
    icon: ShieldCheck,
    name: "Liveness",
    status: "phase2",
    pkg: "@framefind/core",
    desc: "Anti-spoof challenge for KYC and onboarding flows",
    detail: "Blink + head turn + smile challenge → texture analysis → liveness score",
  },
  {
    id: "talking",
    icon: Mic,
    name: "Talking",
    status: "phase2",
    pkg: "@framefind/core",
    desc: "Mouth-open detector for meeting UX and speaker indicators",
    detail: "Lip landmarks → Mouth Aspect Ratio → temporal gate → talking event",
  },
  {
    id: "drowsiness",
    icon: Eye,
    name: "Drowsiness",
    status: "phase2",
    pkg: "@framefind/core",
    desc: "Fatigue scoring from blink rate, yawns, and eye closure",
    detail: "Blink events + PERCLOS + yawn rate → temporal window → drowsiness score",
  },
  {
    id: "attention",
    icon: Brain,
    name: "Attention",
    status: "phase2",
    pkg: "@framefind/core",
    desc: "Engagement score from head pose and eye state",
    detail: "abs(yaw) < 20° && abs(pitch) < 15° && eyesOpen → 0–1 score",
  },
  {
    id: "rppg",
    icon: Heart,
    name: "Pulse (rPPG)",
    status: "phase3",
    pkg: "@framefind/core",
    desc: "Heart-rate estimation from facial micro-color changes",
    detail: "Forehead/cheek ROI → temporal RGB signal → POS / CHROM → BPM",
  },
];

const STATUS_CONFIG: Record<DetectorStatus, { label: string; className: string; dot: string }> = {
  live:   { label: "Live",    className: "border-cyan-800/60 bg-cyan-950/30 text-cyan-400",          dot: "bg-cyan-400 animate-pulse" },
  phase2: { label: "Phase 2", className: "border-violet-800/60 bg-violet-950/30 text-violet-400",    dot: "bg-violet-400" },
  phase3: { label: "Phase 3", className: "border-neutral-700/60 bg-neutral-800/30 text-neutral-500", dot: "bg-neutral-600" },
};

function DetectorCard({ detector, index, size = "normal" }: { detector: Detector; index: number; size?: "large" | "normal" }) {
  const isLive = detector.status === "live";
  const status = STATUS_CONFIG[detector.status];
  const Icon = detector.icon;

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-30px" }}
      transition={{ duration: 0.35, delay: index * 0.05 }}
      aria-label={`${detector.name} detector — ${status.label}`}
      className={`group relative rounded-xl border transition-colors duration-200 ${
        size === "large" ? "p-6" : "p-5"
      } ${
        isLive
          ? "border-neutral-700/80 bg-[#111] hover:border-neutral-600 hover:bg-[#141414]"
          : "border-neutral-800/60 bg-[#0d0d0d]"
      }`}
    >
      <div className="flex items-start gap-4 mb-4">
        <div
          className={`rounded-lg flex items-center justify-center shrink-0 ${
            size === "large" ? "w-11 h-11" : "w-9 h-9"
          } ${
            isLive
              ? "border border-cyan-900/50 bg-cyan-950/30"
              : "border border-neutral-800 bg-neutral-900"
          }`}
          aria-hidden="true"
        >
          <Icon className={`${size === "large" ? "w-5 h-5" : "w-4 h-4"} ${isLive ? "text-cyan-400" : "text-neutral-600"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`${size === "large" ? "text-base" : "text-sm"} font-semibold ${isLive ? "text-white" : "text-neutral-500"}`}>
              {detector.name}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 text-[10px] font-mono px-2 py-0.5 rounded-full border ${status.className}`}
              aria-label={`Status: ${status.label}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} aria-hidden="true" />
              {status.label}
            </span>
          </div>
          <code className={`text-[10px] font-mono ${isLive ? "text-neutral-500" : "text-neutral-700"}`}>
            {detector.pkg}
          </code>
        </div>
      </div>

      <p className={`${size === "large" ? "text-sm" : "text-sm"} mb-3 leading-relaxed ${isLive ? "text-neutral-400" : "text-neutral-600"}`}>
        {detector.desc}
      </p>

      <div className={`text-[11px] font-mono leading-relaxed p-2.5 rounded-md border ${
        isLive
          ? "text-neutral-500 bg-neutral-900/50 border-neutral-800"
          : "text-neutral-700 bg-neutral-900/20 border-neutral-800/40"
      }`}>
        {detector.detail}
      </div>
    </motion.article>
  );
}

export function DetectorsSection() {
  return (
    <section id="detectors" className="py-24 px-6 border-y border-neutral-800/40 bg-neutral-900/10" aria-labelledby="detectors-heading">
      <div className="max-w-6xl mx-auto">
        <FadeIn>
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-14">
            <div>
              <div className="text-[11px] font-mono text-cyan-500 uppercase tracking-widest mb-3">
                Modular Detectors
              </div>
              <h2 id="detectors-heading" className="text-3xl md:text-4xl font-semibold tracking-tight text-white mb-3 leading-tight">
                One platform, many signals.
              </h2>
              <p className="text-neutral-400 max-w-lg leading-relaxed">
                All detectors live in <code className="text-cyan-500 text-xs">@framefind/core</code> with React hooks in{" "}
                <code className="text-cyan-500 text-xs">@framefind/react</code>. Models stream from CDN — zero bundle cost.
              </p>
            </div>
          </div>
        </FadeIn>

        {/* Available now */}
        <FadeIn delay={0.05}>
          <h3 className="text-xs font-mono text-cyan-500 uppercase tracking-widest mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" aria-hidden="true" />
            Available now
          </h3>
        </FadeIn>
        <div className="grid sm:grid-cols-2 gap-4 mb-12">
          {LIVE_DETECTORS.map((d, i) => (
            <DetectorCard key={d.id} detector={d} index={i} size="large" />
          ))}
        </div>

        {/* Roadmap */}
        <FadeIn delay={0.1}>
          <h3 className="text-xs font-mono text-neutral-500 uppercase tracking-widest mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-neutral-600" aria-hidden="true" />
            On the roadmap
          </h3>
        </FadeIn>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {ROADMAP_DETECTORS.map((d, i) => (
            <DetectorCard key={d.id} detector={d} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
