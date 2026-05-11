"use client";

import { useBlinkDetector } from "@framefind/react";
import { Eye } from "lucide-react";
import { useCallback, useState } from "react";
import { motion, AnimatePresence } from "motion/react";

// ─── EAR Bar ──────────────────────────────────────────────────────────────────

function EarBar({
  label,
  ear,
  baseline,
  isBlinking,
}: {
  label: string;
  ear: number | null;
  baseline: number | null;
  isBlinking: boolean;
}) {
  const pct = ear !== null ? Math.min(Math.max(ear / 0.4, 0), 1) : 0;
  const calibrated = baseline !== null;

  return (
    <div className="flex flex-col gap-1.5 flex-1 min-w-0">
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] font-mono text-neutral-600 uppercase tracking-widest">
          {label}
        </span>
        <div className="flex items-center gap-1.5">
          <span
            className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full transition-colors ${
              isBlinking
                ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                : "bg-neutral-800 text-neutral-600 border border-neutral-700"
            }`}
          >
            {isBlinking ? "closed" : "open"}
          </span>
          <span className="text-xs font-mono tabular-nums text-white font-semibold w-12 text-right">
            {ear !== null ? ear.toFixed(3) : "—"}
          </span>
        </div>
      </div>
      <div className="relative h-1.5 bg-neutral-800 rounded-full overflow-hidden">
        <motion.div
          className={`absolute top-0 left-0 h-full rounded-full transition-colors ${isBlinking ? "bg-cyan-300" : "bg-cyan-500"}`}
          animate={{ width: `${pct * 100}%` }}
          transition={{ type: "spring", stiffness: 200, damping: 25 }}
        />
      </div>
      {!calibrated && (
        <p className="text-[10px] font-mono text-yellow-500/70">Calibrating…</p>
      )}
    </div>
  );
}

// ─── Event Counter ────────────────────────────────────────────────────────────

function EventCounter({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 px-3">
      <motion.span
        key={count}
        initial={{ scale: 1.4, opacity: 0.6 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className={`text-3xl font-semibold tabular-nums ${color}`}
      >
        {count}
      </motion.span>
      <span className="text-[10px] font-mono text-neutral-600 uppercase tracking-widest whitespace-nowrap">
        {label}
      </span>
    </div>
  );
}

// ─── BlinkDemo ────────────────────────────────────────────────────────────────

export function BlinkDemo() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [blinkCount, setBlinkCount] = useState(0);
  const [flashKey, setFlashKey] = useState(0);

  const handleBlink = useCallback(() => {
    setBlinkCount((c) => c + 1);
    setFlashKey((k) => k + 1);
  }, []);

  const { videoRef, result, loading: modelLoading } = useBlinkDetector({
    enabled: true,
    onBlink: handleBlink,
  });

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      });
      setStream(mediaStream);
      setBlinkCount(0);
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
    setBlinkCount(0);
  };

  const hasFace = stream && result.faceDetected;

  return (
    <div className="bg-neutral-950 border border-neutral-800/60 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-neutral-800/60 bg-neutral-900/30">
        <div
          className={`w-2 h-2 rounded-full transition-all ${
            stream
              ? "bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.5)]"
              : "bg-neutral-700"
          }`}
        />
        <span className="text-xs font-mono text-neutral-500">
          {modelLoading
            ? "Loading model…"
            : stream
              ? "Live · Blink Detection"
              : "Blink Detector"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {modelLoading && (
            <div className="w-3.5 h-3.5 border-2 border-cyan-400/60 border-t-transparent rounded-full animate-spin" />
          )}
        </div>
      </div>

      {/* Camera feed */}
      <div className="relative aspect-[4/3] bg-black overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover [transform:scaleX(-1)] ${!stream ? "hidden" : ""}`}
        />
        {!stream && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <Eye className="w-8 h-8 text-neutral-700" />
            <p className="text-xs text-neutral-600 font-mono">Camera off</p>
          </div>
        )}

        {/* Flash overlay on blink */}
        <AnimatePresence mode="wait">
          {flashKey > 0 && (
            <motion.div
              key={flashKey}
              initial={{ opacity: 0.35 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="absolute inset-0 bg-cyan-400 pointer-events-none"
            />
          )}
        </AnimatePresence>

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
              <span className="text-[11px] text-neutral-400 font-mono tracking-widest uppercase">
                Loading model
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* No face warning */}
        {stream && !result.faceDetected && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-yellow-500/20 border border-yellow-500/40 backdrop-blur-sm px-3 py-1 rounded-full">
            <span className="text-[10px] font-mono text-yellow-400">
              No face detected
            </span>
          </div>
        )}
      </div>

      {/* Stats */}
      <div
        className="px-4 py-3.5 border-t border-neutral-800/60 bg-neutral-900/20 space-y-3"
        aria-live="polite"
        aria-atomic="true"
        aria-label="Blink detection stats"
      >
        {/* EAR bar (avg smoothed) */}
        <div className="flex gap-3">
          <EarBar
            label="EAR"
            ear={hasFace ? result.smoothedEar : null}
            baseline={result.baselineEar}
            isBlinking={result.isBlinking}
          />
        </div>

        {/* Blink counter */}
        <div className="flex items-center justify-center border border-neutral-800 rounded-xl bg-neutral-900/30 overflow-hidden">
          <EventCounter label="Blinks" count={blinkCount} color="text-cyan-400" />
        </div>
      </div>

      {/* Controls */}
      <div className="px-4 py-3 border-t border-neutral-800/60">
        {stream ? (
          <button
            type="button"
            aria-pressed={true}
            onClick={stopCamera}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-all active:scale-[0.98]"
          >
            <div className="w-3 h-3 rounded-sm bg-current" />
            Stop Camera
          </button>
        ) : (
          <button
            type="button"
            aria-pressed={false}
            onClick={startCamera}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-cyan-500 hover:bg-cyan-400 text-white transition-all active:scale-[0.98] shadow-[0_0_20px_rgba(6,182,212,0.2)]"
          >
            <div className="w-0 h-0 border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent border-l-[8px] border-l-current" />
            Start Camera
          </button>
        )}
      </div>
    </div>
  );
}
