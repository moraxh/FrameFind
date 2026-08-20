"use client";

import type { GazeRegion, GazeResult } from "@framefind/react";
import { useGazeDetector } from "@framefind/react";
import { Camera, Crosshair, Expand, Minimize2, RotateCcw, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const REGIONS: GazeRegion[] = [
  "top-left",
  "top",
  "top-right",
  "left",
  "center",
  "right",
  "bottom-left",
  "bottom",
  "bottom-right",
];

const CAL_INSET = 0.08;
const CAL_TARGETS: Array<{ x: number; y: number }> = [
  { x: CAL_INSET, y: CAL_INSET },
  { x: 0.5, y: CAL_INSET },
  { x: 1 - CAL_INSET, y: CAL_INSET },
  { x: CAL_INSET, y: 0.5 },
  { x: 0.5, y: 0.5 },
  { x: 1 - CAL_INSET, y: 0.5 },
  { x: CAL_INSET, y: 1 - CAL_INSET },
  { x: 0.5, y: 1 - CAL_INSET },
  { x: 1 - CAL_INSET, y: 1 - CAL_INSET },
];

const SETTLE_MS = 900;
const CAPTURE_FRAMES = 8;
const CAPTURE_INTERVAL_MS = 80;

function RegionGrid({ active }: { active: GazeRegion | null }) {
  return (
    <div className="grid grid-cols-3 grid-rows-3 w-full h-full">
      {REGIONS.map((r) => {
        const isActive = active === r;
        return (
          <div
            key={r}
            className={`border border-neutral-700/40 transition-colors ${
              isActive ? "bg-cyan-500/25" : "bg-transparent"
            }`}
          />
        );
      })}
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
  disabled,
  children,
}: {
  onClick: () => void;
  variant: "start" | "stop" | "ghost";
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const base =
    "flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100";
  const variants: Record<typeof variant, string> = {
    start:
      "bg-cyan-500 hover:bg-cyan-400 text-white shadow-[0_0_20px_rgba(6,182,212,0.2)]",
    stop: "bg-neutral-800 hover:bg-neutral-700 text-neutral-300",
    ghost:
      "bg-transparent border border-neutral-800 hover:border-neutral-700 hover:bg-neutral-900 text-neutral-300",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${variants[variant]}`}
    >
      {children}
    </button>
  );
}

type CalState =
  | { phase: "idle" }
  | { phase: "settle"; index: number }
  | { phase: "capture"; index: number };

export function GazeDemo() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const noFaceFramesRef = useRef(0);
  const NO_FACE_GRACE = 6;

  const {
    videoRef,
    result,
    inferenceTime,
    loading: modelLoading,
    accumulateCalibrationFrame,
    commitCalibrationSample,
    discardAccumulatedFrames,
    calibrate,
    clearCalibration,
    isCalibrated,
  } = useGazeDetector({ enabled: true });

  const [displayResult, setDisplayResult] = useState<GazeResult | null>(null);
  const [displayInferenceTime, setDisplayInferenceTime] = useState<number | null>(
    null,
  );
  const lastInferenceUpdateRef = useRef<number>(0);

  const [cal, setCal] = useState<CalState>({ phase: "idle" });
  const [fullscreen, setFullscreen] = useState(false);
  const captureCountRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const cancelledRef = useRef(false);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => clearTimer, []);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (cal.phase !== "idle") {
          cancelledRef.current = true;
          clearTimer();
          setCal({ phase: "idle" });
        } else {
          setFullscreen(false);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen, cal.phase]);

  useEffect(() => {
    if (fullscreen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [fullscreen]);

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
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play().catch(() => {});
      }
    } catch {
      alert("Camera access denied or not available");
    }
  };

  const stopCamera = () => {
    cancelledRef.current = true;
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
    if (videoRef.current) videoRef.current.srcObject = null;
    noFaceFramesRef.current = 0;
    setDisplayResult(null);
    clearTimer();
    discardFramesRef.current();
    setCal({ phase: "idle" });
  };

  const accumulateFrameRef = useRef(accumulateCalibrationFrame);
  accumulateFrameRef.current = accumulateCalibrationFrame;
  const commitSampleRef = useRef(commitCalibrationSample);
  commitSampleRef.current = commitCalibrationSample;
  const discardFramesRef = useRef(discardAccumulatedFrames);
  discardFramesRef.current = discardAccumulatedFrames;
  const calibrateRef = useRef(calibrate);
  calibrateRef.current = calibrate;

  const startSettle = useCallback((index: number) => {
    cancelledRef.current = false;
    clearTimer();
    setCal({ phase: "settle", index });

    timerRef.current = setTimeout(() => {
      if (cancelledRef.current) return;
      captureCountRef.current = 0;
      setCal({ phase: "capture", index });

      const target = CAL_TARGETS[index];

      const tick = () => {
        if (cancelledRef.current) return;
        // Accumulate raw frames; they are averaged into a single sample on commit,
        // so per-frame jitter does not enter the least-squares fit.
        accumulateFrameRef.current(target.x, target.y);
        captureCountRef.current += 1;

        if (captureCountRef.current >= CAPTURE_FRAMES) {
          commitSampleRef.current();
          const next = index + 1;
          if (next >= CAL_TARGETS.length) {
            calibrateRef.current();
            setCal({ phase: "idle" });
          } else {
            startSettle(next);
          }
        } else {
          timerRef.current = setTimeout(tick, CAPTURE_INTERVAL_MS);
        }
      };

      timerRef.current = setTimeout(tick, CAPTURE_INTERVAL_MS);
    }, SETTLE_MS);
  }, []);

  const beginCalibration = () => {
    clearCalibration();
    startSettle(0);
  };

  const cancelCalibration = () => {
    cancelledRef.current = true;
    clearTimer();
    discardFramesRef.current();
    setCal({ phase: "idle" });
    clearCalibration();
  };

  const isActive = !!stream;
  const region = displayResult?.faceDetected ? displayResult.region : null;
  const screenX = displayResult?.faceDetected ? displayResult.screen.x : 0.5;
  const screenY = displayResult?.faceDetected ? displayResult.screen.y : 0.5;
  const isCalibrating = cal.phase !== "idle";

  const handleOpen = async () => {
    if (!stream) await startCamera();
    setFullscreen(true);
  };

  return (
    <>
      {/* Hidden video element kept in DOM so useGazeDetector can attach to it */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="hidden"
      />

      <div className="bg-neutral-950 border border-neutral-800/60 rounded-2xl overflow-hidden">
        <div className="relative bg-neutral-950 aspect-[4/3] flex items-center justify-center">
          <EmptyState
            icon={<Camera className="w-8 h-8" />}
            label="Gaze tracking demo"
            hint="Opens fullscreen — requires camera access"
          />
          <AnimatePresence>
            {modelLoading && isActive && (
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
        </div>

        <div className="px-4 py-3 border-t border-neutral-800/60 flex gap-2">
          <DemoButton onClick={handleOpen} variant="start" disabled={isActive && modelLoading}>
            <Expand className="w-3.5 h-3.5" />
            {isActive && modelLoading ? "Loading model…" : "Open Fullscreen"}
          </DemoButton>
        </div>
      </div>

      {fullscreen && (
        <FullscreenGaze
          videoStream={stream}
          screenX={screenX}
          screenY={screenY}
          region={region}
          faceDetected={!!displayResult?.faceDetected}
          inferenceTime={displayInferenceTime}
          isCalibrated={isCalibrated}
          isCalibrating={isCalibrating}
          calState={cal}
          onClose={() => {
            if (isCalibrating) cancelCalibration();
            setFullscreen(false);
            stopCamera();
          }}
          onCalibrate={beginCalibration}
          onResetCalibration={clearCalibration}
          onCancelCalibration={cancelCalibration}
          modelLoading={modelLoading}
        />
      )}
    </>
  );
}

function FullscreenGaze({
  videoStream,
  screenX,
  screenY,
  region,
  faceDetected,
  inferenceTime,
  isCalibrated,
  isCalibrating,
  calState,
  onClose,
  onCalibrate,
  onResetCalibration,
  onCancelCalibration,
  modelLoading,
}: {
  videoStream: MediaStream | null;
  screenX: number;
  screenY: number;
  region: GazeRegion | null;
  faceDetected: boolean;
  inferenceTime: number | null;
  isCalibrated: boolean;
  isCalibrating: boolean;
  calState: CalState;
  onClose: () => void;
  onCalibrate: () => void;
  onResetCalibration: () => void;
  onCancelCalibration: () => void;
  modelLoading: boolean;
}) {
  const pipRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (pipRef.current && videoStream) {
      pipRef.current.srcObject = videoStream;
      pipRef.current.play().catch(() => {});
    }
  }, [videoStream]);

  const activeIndex = calState.phase === "idle" ? -1 : calState.index;
  const target = activeIndex >= 0 ? CAL_TARGETS[activeIndex] : null;
  const progress =
    activeIndex >= 0
      ? (activeIndex + (calState.phase === "capture" ? 0.5 : 0)) /
        CAL_TARGETS.length
      : 0;
  const isLastCalibrationStep =
    isCalibrating && activeIndex === CAL_TARGETS.length - 1;
  const pipPos =
    isLastCalibrationStep
      ? {
          left: "1.25rem",
          right: "auto",
          top: "auto",
          bottom: "1.25rem",
        }
      : {
          left: "auto",
          right: "1.25rem",
          top: "auto",
          bottom: "1.25rem",
        };

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[9999] bg-black"
      aria-label="Gaze fullscreen demo"
    >
      {/* Region grid full viewport */}
      <div className="absolute inset-0 pointer-events-none">
        <RegionGrid active={isCalibrating ? null : region} />
      </div>

      {/* Live gaze dot (hidden during calibration to not distract) */}
      {!isCalibrating && faceDetected && (
        <motion.div
          className="absolute w-5 h-5 rounded-full bg-cyan-400 shadow-[0_0_40px_rgba(6,182,212,0.9)] pointer-events-none"
          animate={{ left: `${screenX * 100}%`, top: `${screenY * 100}%` }}
          transition={{ type: "spring", stiffness: 220, damping: 28 }}
          style={{ translateX: "-50%", translateY: "-50%" }}
        />
      )}

      {/* Calibration target */}
      <AnimatePresence mode="wait">
        {isCalibrating && target && (
          <motion.div
            key={activeIndex}
            initial={{ scale: 0.3, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.3, opacity: 0 }}
            transition={{ type: "spring", stiffness: 240, damping: 22 }}
            className="absolute pointer-events-none"
            style={{
              left: `${target.x * 100}%`,
              top: `${target.y * 100}%`,
              translate: "-50% -50%",
            }}
          >
            <div className="relative w-16 h-16">
              <div
                className={`absolute inset-0 rounded-full border-2 ${
                  calState.phase === "capture"
                    ? "border-cyan-400 animate-ping"
                    : "border-cyan-300/70"
                }`}
              />
              <div
                className={`absolute inset-5 rounded-full ${
                  calState.phase === "capture" ? "bg-cyan-400" : "bg-cyan-300"
                } shadow-[0_0_40px_rgba(6,182,212,0.9)]`}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top bar */}
      <div className="absolute top-0 inset-x-0 p-5 flex items-center gap-4 z-10">
        <div className="flex items-center gap-2 bg-neutral-950/80 backdrop-blur-md border border-neutral-800 rounded-lg px-3 py-2">
          <span className="text-base leading-none">👁️</span>
          <span className="text-xs text-white font-medium">
            {isCalibrating
              ? `Calibrating · ${activeIndex + 1}/${CAL_TARGETS.length}`
              : faceDetected
                ? region?.replace("-", " ")
                : "No face"}
          </span>
          <span
            className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full border ${
              isCalibrated
                ? "border-cyan-500/40 text-cyan-300 bg-cyan-500/10"
                : "border-neutral-700 text-neutral-500"
            }`}
          >
            {isCalibrated ? "CAL" : "UNCAL"}
          </span>
          <span className="text-[11px] font-mono text-neutral-500 tabular-nums border-l border-neutral-800 pl-3 w-12">
            {inferenceTime !== null ? `${inferenceTime.toFixed(0)}ms` : ""}
          </span>
        </div>

        {isCalibrating && (
          <div className="flex-1 max-w-md">
            <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-cyan-400"
                animate={{ width: `${progress * 100}%` }}
                transition={{ type: "spring", stiffness: 200, damping: 30 }}
              />
            </div>
            <p className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest mt-1">
              {calState.phase === "settle" ? "fixate…" : "capturing"}
            </p>
          </div>
        )}

        <div className="flex-1" />

        {!isCalibrating ? (
          <>
            {isCalibrated ? (
              <button
                type="button"
                onClick={onResetCalibration}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-300 text-xs"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset calibration
              </button>
            ) : (
              <button
                type="button"
                onClick={onCalibrate}
                disabled={modelLoading}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-white text-xs font-medium shadow-[0_0_20px_rgba(6,182,212,0.3)] disabled:opacity-40"
              >
                <Crosshair className="w-3.5 h-3.5" />
                Calibrate
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-300 text-xs"
            >
              <Minimize2 className="w-3.5 h-3.5" />
              Exit (Esc)
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onCancelCalibration}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-300 text-xs"
          >
            <X className="w-3.5 h-3.5" />
            Cancel
          </button>
        )}
      </div>

      {/* PiP video preview */}
      <motion.div
        className="absolute w-48 bg-neutral-950/90 backdrop-blur-md border border-neutral-800 rounded-xl overflow-hidden shadow-2xl"
        animate={pipPos}
        transition={{ type: "spring", stiffness: 240, damping: 28 }}
      >
        <div className="relative bg-black aspect-[4/3]">
          <video
            ref={pipRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
          <span className="absolute top-2 left-2 text-[9px] font-mono text-neutral-400 uppercase tracking-widest bg-black/60 px-1.5 py-0.5 rounded">
            preview
          </span>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
