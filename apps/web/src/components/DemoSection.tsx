"use client";

import { useState, useRef, useEffect } from "react";
import { Camera, Upload } from "lucide-react";
import { useGlassesDetector } from "@framefind/react";
import { FadeIn } from "./FadeIn";
import type { DetectionResult } from "@framefind/react";

export function DemoSection() {
  const [activeMode, setActiveMode] = useState<"camera" | "upload">("camera");
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [result, setResult] = useState<DetectionResult | null>(null);
  const detectingRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);

  const { detect, loading: modelLoading } = useGlassesDetector({
    modelUrl: "/models/glasses-detector.onnx",
    enabled: true,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  const runDetectionLoop = () => {
    if (!stream || !videoRef.current || !canvasRef.current || detectingRef.current) return;

    detectingRef.current = true;
    detect(videoRef.current, canvasRef.current)
      .then(() => {
        detectingRef.current = false;
        animationFrameRef.current = requestAnimationFrame(runDetectionLoop);
      })
      .catch(() => {
        detectingRef.current = false;
        animationFrameRef.current = requestAnimationFrame(runDetectionLoop);
      });
  };

  useEffect(() => {
    if (stream && activeMode === "camera") {
      animationFrameRef.current = requestAnimationFrame(runDetectionLoop);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [stream, activeMode, detect]);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      setStream(mediaStream);
      setImage(null);
      setResult(null);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play().catch(() => {});
      }
    } catch (error) {
      alert("Camera access denied or not available");
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      stopCamera();
      setResult(null);
      const reader = new FileReader();
      reader.onload = async (event) => {
        setImage(event.target?.result as string);
        // Auto-detect en imagen después de cargar
        if (fileInputRef.current?.files?.[0]) {
          const canvas = canvasRef.current;
          if (canvas) {
            const ctx = canvas.getContext("2d");
            if (ctx) {
              const img = new Image();
              img.onload = async () => {
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);
                await detect(videoRef.current!, canvas);
              };
              img.src = event.target?.result as string;
            }
          }
        }
      };
      reader.readAsDataURL(file);
    }
  };

  if (!mounted) return null;

  return (
    <section className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <FadeIn>
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white mb-4">
              Try It Live
            </h2>
            <p className="text-lg text-neutral-400 max-w-2xl mx-auto">
              Real-time glasses detection in your browser. No account required.
            </p>
          </div>
        </FadeIn>

        <FadeIn delay={0.1}>
          <div className="grid lg:grid-cols-2 gap-12 items-start">
            {/* Demo */}
            <div className="space-y-4">
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
                <div className="flex border-b border-neutral-800">
                  {(["camera", "upload"] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => {
                        setActiveMode(mode);
                        if (mode === "upload") stopCamera();
                        setResult(null);
                      }}
                      className={`flex-1 px-6 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                        activeMode === mode
                          ? "border-b-2 border-cyan-400 text-white bg-white/5"
                          : "text-neutral-500 hover:text-neutral-300"
                      }`}
                    >
                      {mode === "camera" ? (
                        <>
                          <Camera className="w-4 h-4" />
                          Camera
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4" />
                          Image
                        </>
                      )}
                    </button>
                  ))}
                </div>

                <div className="bg-black aspect-square sm:aspect-video flex items-center justify-center overflow-hidden relative">
                  {activeMode === "camera" ? (
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover bg-black"
                    />
                  ) : (
                    <>
                      {image ? (
                        <img src={image} alt="Uploaded" className="w-full h-full object-contain" />
                      ) : (
                        <div className="text-center">
                          <Upload className="w-10 h-10 text-neutral-600 mx-auto" />
                        </div>
                      )}
                    </>
                  )}
                  <canvas ref={canvasRef} style={{ display: "none" }} />
                </div>

                {/* Result Overlay */}
                {result && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-xl">
                    <div className="text-center text-white space-y-3">
                      <div className="text-5xl">{result.glasses ? "👓" : "😊"}</div>
                      <div>
                        <p className="text-lg font-semibold">
                          {result.glasses ? "Glasses Detected" : "No Glasses"}
                        </p>
                        <p className="text-sm text-neutral-300">
                          {(result.probability * 100).toFixed(1)}% confidence
                        </p>
                        <p className="text-xs text-neutral-400 mt-2">
                          {result.latency}ms latency
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="p-4 bg-neutral-900/50 border-t border-neutral-800 flex gap-2">
                  {activeMode === "camera" ? (
                    <>
                      {stream ? (
                        <button
                          onClick={stopCamera}
                          className="w-full px-3 py-2 text-sm bg-neutral-700 hover:bg-neutral-600 text-white rounded-lg font-medium transition-colors"
                        >
                          Stop Camera
                        </button>
                      ) : (
                        <button
                          onClick={startCamera}
                          className="w-full px-3 py-2 text-sm bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg font-medium transition-colors"
                        >
                          Start Camera
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full px-3 py-2 text-sm bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg font-medium transition-colors"
                      >
                        Choose Image
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Info */}
            <div className="space-y-6">
              <div>
                <h3 className="text-2xl font-semibold text-white mb-3">
                  Works Right Here
                </h3>
                <p className="text-neutral-400 leading-relaxed mb-4">
                  No server calls. No tracking. Your camera and image data never leave your device.
                </p>
                <ul className="space-y-3">
                  <li className="flex gap-3">
                    <span className="text-cyan-400 font-bold">→</span>
                    <span className="text-neutral-300">
                      <strong>Instant:</strong> Sub-100ms inference on device
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-cyan-400 font-bold">→</span>
                    <span className="text-neutral-300">
                      <strong>Lightweight:</strong> 6.2MB model, works on any device
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-cyan-400 font-bold">→</span>
                    <span className="text-neutral-300">
                      <strong>Private:</strong> All processing happens locally in your browser
                    </span>
                  </li>
                </ul>
              </div>

              <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-4">
                <p className="text-sm text-cyan-200">
                  💡 Install package to enable real detection with your own ONNX model.
                </p>
              </div>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
