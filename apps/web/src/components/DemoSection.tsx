"use client";

import type { DetectionResult } from "@framefind/react";
import { useGlassesDetector } from "@framefind/react";
import { Camera, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import NextImage from "next/image";
import { FadeIn } from "./FadeIn";
import { TabSwitcher } from "./ui/TabSwitcher";
import { AnimatePresence, motion } from "motion/react";

const HeadPoseDemo = dynamic(
  () => import("./HeadPoseDemo").then((m) => ({ default: m.HeadPoseDemo })),
  {
    ssr: false,
    loading: () => (
      <div className="bg-neutral-950 border border-neutral-800/60 rounded-2xl aspect-[4/3] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-cyan-400/60 border-t-transparent rounded-full animate-spin" />
          <span className="text-[11px] text-neutral-600 font-mono tracking-widest uppercase">Initializing</span>
        </div>
      </div>
    ),
  }
);

const BlinkDemo = dynamic(
  () => import("./BlinkDemo").then((m) => ({ default: m.BlinkDemo })),
  {
    ssr: false,
    loading: () => (
      <div className="bg-neutral-950 border border-neutral-800/60 rounded-2xl aspect-[4/3] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-cyan-400/60 border-t-transparent rounded-full animate-spin" />
          <span className="text-[11px] text-neutral-600 font-mono tracking-widest uppercase">Initializing</span>
        </div>
      </div>
    ),
  }
);

type DemoTab = "glasses" | "headpose" | "blink";

// ─── Result Overlay ────────────────────────────────────────────────────────────

function ResultOverlay({
  result,
  inferenceTime,
}: {
  result: DetectionResult;
  inferenceTime: number | null;
}) {
  const isGlasses = result.faceDetected && result.glasses;
  const noFace = !result.faceDetected;

  const label = noFace ? "No Face" : isGlasses ? "Glasses" : "No Glasses";
  const pct = result.faceDetected ? Math.round(result.probability * 100) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ type: "spring", stiffness: 280, damping: 30 }}
      className="absolute bottom-3 right-3 pointer-events-none"
    >
      <div className="bg-neutral-950/90 backdrop-blur-md border border-neutral-800 rounded-lg px-3 py-2 flex items-center gap-3">
        <span className="text-lg leading-none">
          {noFace ? "🫣" : isGlasses ? "👓" : "😊"}
        </span>
        <span className={`text-xs font-medium ${noFace ? "text-yellow-300" : "text-white"}`}>
          {label}
        </span>
        <span className="text-[11px] font-mono text-neutral-500 tabular-nums w-8 text-right">
          {pct !== null ? `${pct}%` : ""}
        </span>
        <span className="text-[11px] font-mono text-neutral-600 tabular-nums border-l border-neutral-800 pl-3 w-12">
          {inferenceTime !== null ? `${inferenceTime.toFixed(0)}ms` : ""}
        </span>
      </div>
    </motion.div>
  );
}

// ─── Glasses Demo ──────────────────────────────────────────────────────────────

function GlassesDemo() {
  const [activeMode, setActiveMode] = useState<"camera" | "upload">("camera");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const noFaceFramesRef = useRef(0);
  const NO_FACE_GRACE = 6;

  const { videoRef, detectImage, result, inferenceTime, loading: modelLoading } =
    useGlassesDetector({ enabled: true });

  const [displayResult, setDisplayResult] = useState<DetectionResult | null>(null);
  const [displayInferenceTime, setDisplayInferenceTime] = useState<number | null>(null);
  const lastInferenceUpdateRef = useRef<number>(0);

  useEffect(() => {
    if (inferenceTime === null) return;
    const now = Date.now();
    if (now - lastInferenceUpdateRef.current >= 300) {
      lastInferenceUpdateRef.current = now;
      setDisplayInferenceTime(inferenceTime);
    }
  }, [inferenceTime]);

  useEffect(() => {
    if (!result) return;
    if (result.faceDetected) {
      noFaceFramesRef.current = 0;
      setDisplayResult(result);
    } else {
      noFaceFramesRef.current += 1;
      if (noFaceFramesRef.current >= NO_FACE_GRACE) setDisplayResult(result);
    }
  }, [result]);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      setStream(mediaStream);
      setImage(null);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play().catch(() => {});
      }
    } catch {
      alert("Camera access denied or not available");
    }
  };

  const stopCamera = () => {
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
    if (videoRef.current) videoRef.current.srcObject = null;
    noFaceFramesRef.current = 0;
    setDisplayResult(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    stopCamera();
    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      setImage(dataUrl);
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const img = new Image();
          img.onload = async () => {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            await detectImage(canvas);
          };
          img.src = dataUrl;
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const isActive = stream || image;

  return (
    <div className="bg-neutral-950 border border-neutral-800/60 rounded-2xl overflow-hidden">
      {/* Mode tabs */}
      <div className="flex border-b border-neutral-800/60">
        {(["camera", "upload"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => {
              setActiveMode(mode);
              if (mode === "upload") stopCamera();
            }}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-mono transition-all ${
              activeMode === mode
                ? "text-white bg-white/5 border-b border-cyan-400"
                : "text-neutral-600 hover:text-neutral-400 hover:bg-white/[0.02]"
            }`}
          >
            {mode === "camera" ? (
              <Camera className="w-3.5 h-3.5" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            {mode === "camera" ? "Camera" : "Image"}
          </button>
        ))}
      </div>

      {/* Viewport */}
      <div className="relative bg-black aspect-[4/3] flex items-center justify-center overflow-hidden">
        {activeMode === "camera" ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${!stream ? "hidden" : ""}`}
            />
            {!stream && (
              <EmptyState icon={<Camera className="w-8 h-8" />} label="Camera is off" hint="Click start to begin" />
            )}
          </>
        ) : image ? (
          <NextImage
            src={image}
            alt="Uploaded photo for glasses detection"
            fill
            unoptimized
            className="object-contain"
          />
        ) : (
          <EmptyState icon={<Upload className="w-8 h-8" />} label="No image" hint="Upload a photo to test" />
        )}

        <canvas ref={canvasRef} style={{ display: "none" }} />

        {/* Loading overlay */}
        <AnimatePresence>
          {modelLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-20"
            >
              <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-[11px] text-neutral-400 font-mono tracking-widest uppercase">Loading model</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Result overlay */}
        <AnimatePresence>
          {displayResult && isActive && !modelLoading && (
            <ResultOverlay result={displayResult} inferenceTime={displayInferenceTime} />
          )}
        </AnimatePresence>
      </div>

      {/* Controls */}
      <div className="px-4 py-3 border-t border-neutral-800/60 flex gap-2">
        {activeMode === "camera" ? (
          stream ? (
            <DemoButton onClick={stopCamera} variant="stop">
              <div className="w-3 h-3 rounded-sm bg-current" />
              Stop Camera
            </DemoButton>
          ) : (
            <DemoButton onClick={startCamera} variant="start">
              <div className="w-0 h-0 border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent border-l-[8px] border-l-current" />
              Start Camera
            </DemoButton>
          )
        ) : (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
              aria-label="Upload image for glasses detection"
            />
            <DemoButton onClick={() => fileInputRef.current?.click()} variant="start">
              <Upload className="w-3.5 h-3.5" />
              Choose Image
            </DemoButton>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Shared primitives ─────────────────────────────────────────────────────────

function EmptyState({
  icon,
  label,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 text-center p-6">
      <div className="text-neutral-700">{icon}</div>
      <p className="text-sm text-neutral-500 font-medium">{label}</p>
      <p className="text-xs text-neutral-700">{hint}</p>
    </div>
  );
}

function DemoButton({
  onClick,
  variant,
  children,
}: {
  onClick: () => void;
  variant: "start" | "stop";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all active:scale-[0.98] ${
        variant === "start"
          ? "bg-cyan-500 hover:bg-cyan-400 text-white shadow-[0_0_20px_rgba(6,182,212,0.2)]"
          : "bg-neutral-800 hover:bg-neutral-700 text-neutral-300"
      }`}
    >
      {children}
    </button>
  );
}

// ─── Info panels ───────────────────────────────────────────────────────────────

const INFO: Record<DemoTab, { title: string; desc: string; stats: { label: string; value: string; unit?: string }[]; bullets: { label: string; text: string }[] }> = {
  glasses: {
    title: "Glasses Detection",
    desc: "Runs entirely in your browser. No server calls, no data leaves your device.",
    stats: [
      { label: "Inference", value: "~27", unit: "ms" },
      { label: "Model size", value: "6.2", unit: "MB" },
      { label: "Backend", value: "WASM" },
    ],
    bullets: [
      { label: "Private", text: "All processing happens locally — zero network requests" },
      { label: "Lightweight", text: "6.2 MB model runs on any modern device" },
      { label: "Accurate", text: "Binary classifier with calibrated probability score" },
    ],
  },
  headpose: {
    title: "Head Pose Estimation",
    desc: "Real-time yaw, pitch, and roll from facial landmarks. No extra model download.",
    stats: [
      { label: "Angles", value: "3", unit: "axes" },
      { label: "Smoothing", value: "1€ filter" },
      { label: "Overhead", value: "<1", unit: "ms" },
    ],
    bullets: [
      { label: "Matrix-based", text: "Facial transformation matrix → ZYX Euler angles" },
      { label: "Smooth", text: "One Euro filter: fast when moving, smooth when still" },
      { label: "Zero-cost", text: "Runs synchronously on landmarks already computed" },
    ],
  },
  blink: {
    title: "Blink Detection",
    desc: "Triple-signal blink detection using blendshapes, EAR geometry, and asymmetry — all on-device.",
    stats: [
      { label: "Signals", value: "3" },
      { label: "Warmup", value: "500", unit: "ms" },
      { label: "Latency", value: "~30", unit: "fps" },
    ],
    bullets: [
      { label: "Multi-signal", text: "Blendshapes + EAR geometry + asymmetry wink detection" },
      { label: "Self-calibrating", text: "Per-eye baseline adapts to your face in under a second" },
      { label: "Drop-rate gate", text: "Rejects slow eyelid movement to eliminate false positives" },
    ],
  },
};

// ─── DemoSection ───────────────────────────────────────────────────────────────

export function DemoSection() {
  const [activeTab, setActiveTab] = useState<DemoTab>("glasses");
  const [mounted, setMounted] = useState(false);
  const [headPoseActivated, setHeadPoseActivated] = useState(false);
  const [blinkActivated, setBlinkActivated] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;

  const handleTabChange = (tab: DemoTab) => {
    setActiveTab(tab);
    if (tab === "headpose") setHeadPoseActivated(true);
    if (tab === "blink") setBlinkActivated(true);
  };

  const info = INFO[activeTab];

  return (
    <>
      <section id="demo" className="py-24 px-6" aria-labelledby="demo-heading">
        <div className="max-w-6xl mx-auto">
          <FadeIn>
            <div className="mb-14">
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
                <div>
                  <p className="text-[11px] font-mono text-cyan-500 uppercase tracking-[0.2em] mb-3">
                    Live demo
                  </p>
                  <h2
                    id="demo-heading"
                    className="text-3xl md:text-4xl font-semibold tracking-tight text-white"
                  >
                    Try it in your browser
                  </h2>
                  <p className="text-neutral-500 mt-2 text-sm max-w-md">
                    No account required. All inference runs locally on your device.
                  </p>
                </div>

                <TabSwitcher
                  tabs={[
                    { id: "glasses" as const, label: "Glasses" },
                    { id: "headpose" as const, label: "Head Pose" },
                    { id: "blink" as const, label: "Blink" },
                  ]}
                  value={activeTab}
                  onChange={handleTabChange}
                  variant="pill"
                  ariaLabel="Live demo feature"
                  panelIdPrefix="demo"
                />
              </div>
            </div>
          </FadeIn>

          <FadeIn delay={0.1}>
            <div
              id={`demo-${activeTab}`}
              role="tabpanel"
              aria-labelledby={`tab-btn-demo-${activeTab}`}
              className="grid lg:grid-cols-[1fr_380px] gap-8 items-start"
            >
              {/* Demo panel */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  transition={{ duration: 0.2 }}
                >
                  {activeTab === "glasses" ? (
                    <GlassesDemo />
                  ) : activeTab === "headpose" && headPoseActivated ? (
                    <HeadPoseDemo />
                  ) : activeTab === "blink" && blinkActivated ? (
                    <BlinkDemo />
                  ) : null}
                </motion.div>
              </AnimatePresence>

              {/* Info panel */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab + "-info"}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-6 lg:pt-2"
                >
                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-3">
                    {info.stats.map((s) => (
                      <div
                        key={s.label}
                        className="bg-neutral-950 border border-neutral-800/60 rounded-xl p-3 text-center"
                      >
                        <p className="text-lg font-semibold text-white tabular-nums leading-none">
                          {s.value}
                          {s.unit && (
                            <span className="text-xs text-neutral-600 ml-0.5">{s.unit}</span>
                          )}
                        </p>
                        <p className="text-[10px] text-neutral-600 font-mono uppercase tracking-wider mt-1">
                          {s.label}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Description */}
                  <div>
                    <h3 className="text-base font-semibold text-white mb-1.5">{info.title}</h3>
                    <p className="text-sm text-neutral-500 leading-relaxed">{info.desc}</p>
                  </div>

                  {/* Bullets */}
                  <ul className="space-y-3">
                    {info.bullets.map((b) => (
                      <li key={b.label} className="flex gap-3 items-start">
                        <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 mt-1.5 flex-shrink-0" />
                        <span className="text-sm text-neutral-400 leading-snug">
                          <strong className="text-neutral-200 font-medium">{b.label}.</strong>{" "}
                          {b.text}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {/* Privacy note */}
                  <div className="border border-neutral-800/60 rounded-xl p-4 bg-neutral-950/50">
                    <div className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-cyan-950 border border-cyan-900 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-neutral-300 mb-0.5">100% On-device</p>
                        <p className="text-xs text-neutral-600 leading-relaxed">
                          Your camera feed and images are processed entirely in WebAssembly.
                          Nothing is transmitted to any server.
                        </p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </FadeIn>
        </div>
      </section>
    </>
  );
}
