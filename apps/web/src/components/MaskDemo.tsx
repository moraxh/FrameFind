"use client";

import type { MaskDetectionResult } from "@framefind/react";
import { useMaskDetector } from "@framefind/react";
import { Camera, Upload } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import NextImage from "next/image";
import { useEffect, useRef, useState } from "react";

const LABEL_META: Record<
  MaskDetectionResult["label"],
  { text: string; emoji: string; color: string }
> = {
  with_mask: { text: "Wearing Mask", emoji: "😷", color: "text-cyan-300" },
  without_mask: { text: "No Mask", emoji: "🙂", color: "text-white" },
  incorrect_mask: { text: "Incorrect", emoji: "🤥", color: "text-amber-300" },
};

function ResultOverlay({
  result,
  inferenceTime,
}: {
  result: MaskDetectionResult;
  inferenceTime: number | null;
}) {
  const noFace = !result.faceDetected;
  const meta = LABEL_META[result.label];
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
          {noFace ? "🫣" : meta.emoji}
        </span>
        <span
          className={`text-xs font-medium ${noFace ? "text-yellow-300" : meta.color}`}
        >
          {noFace ? "No Face" : meta.text}
        </span>
        <span className="text-[11px] font-mono text-neutral-500 tabular-nums w-9 text-right">
          {pct !== null ? `${pct}%` : ""}
        </span>
        <span className="text-[11px] font-mono text-neutral-600 tabular-nums border-l border-neutral-800 pl-3 w-12">
          {inferenceTime !== null ? `${inferenceTime.toFixed(0)}ms` : ""}
        </span>
      </div>
    </motion.div>
  );
}

function ProbBar({
  label,
  value,
  active,
}: {
  label: string;
  value: number;
  active: boolean;
}) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span
          className={`text-[10px] font-mono uppercase tracking-widest ${
            active ? "text-cyan-400" : "text-neutral-600"
          }`}
        >
          {label}
        </span>
        <span className="text-[11px] font-mono tabular-nums text-neutral-300">
          {pct}%
        </span>
      </div>
      <div className="relative h-1.5 bg-neutral-800 rounded-full overflow-hidden">
        <motion.div
          className={`absolute top-0 left-0 h-full rounded-full ${
            active ? "bg-cyan-400" : "bg-neutral-600"
          }`}
          animate={{ width: `${pct}%` }}
          transition={{ type: "spring", stiffness: 200, damping: 25 }}
        />
      </div>
    </div>
  );
}

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

export function MaskDemo() {
  const [activeMode, setActiveMode] = useState<"camera" | "upload">("camera");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const noFaceFramesRef = useRef(0);
  const NO_FACE_GRACE = 6;

  const {
    videoRef,
    detectImage,
    result,
    inferenceTime,
    loading: modelLoading,
  } = useMaskDetector({ enabled: true });

  const [displayResult, setDisplayResult] = useState<MaskDetectionResult | null>(
    null,
  );
  const [displayInferenceTime, setDisplayInferenceTime] = useState<number | null>(
    null,
  );
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
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
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
  const probs = displayResult?.probabilities ?? [0, 0, 0];
  const activeIdx = displayResult
    ? displayResult.label === "with_mask"
      ? 0
      : displayResult.label === "without_mask"
        ? 1
        : 2
    : -1;

  return (
    <div className="bg-neutral-950 border border-neutral-800/60 rounded-2xl overflow-hidden">
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
              <EmptyState
                icon={<Camera className="w-8 h-8" />}
                label="Camera is off"
                hint="Click start to begin"
              />
            )}
          </>
        ) : image ? (
          <NextImage
            src={image}
            alt="Uploaded photo for mask detection"
            fill
            unoptimized
            className="object-contain"
          />
        ) : (
          <EmptyState
            icon={<Upload className="w-8 h-8" />}
            label="No image"
            hint="Upload a photo to test"
          />
        )}

        <canvas ref={canvasRef} style={{ display: "none" }} />

        <AnimatePresence>
          {modelLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-20"
            >
              <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-[11px] text-neutral-400 font-mono tracking-widest uppercase">
                Loading model
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {displayResult && isActive && !modelLoading && (
            <ResultOverlay
              result={displayResult}
              inferenceTime={displayInferenceTime}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Per-class probability bars */}
      <div className="px-4 py-3 border-t border-neutral-800/60 grid grid-cols-3 gap-4">
        <ProbBar label="Mask" value={probs[0]} active={activeIdx === 0} />
        <ProbBar label="No mask" value={probs[1]} active={activeIdx === 1} />
        <ProbBar
          label="Incorrect"
          value={probs[2]}
          active={activeIdx === 2}
        />
      </div>

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
              aria-label="Upload image for mask detection"
            />
            <DemoButton
              onClick={() => fileInputRef.current?.click()}
              variant="start"
            >
              <Upload className="w-3.5 h-3.5" />
              Choose Image
            </DemoButton>
          </>
        )}
      </div>
    </div>
  );
}
