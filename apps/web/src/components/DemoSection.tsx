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
  const detectingRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);
  const noFaceFramesRef = useRef(0);
  const NO_FACE_GRACE = 6;

  const { detect, result, loading: modelLoading } = useGlassesDetector({
    enabled: true,
  });
  const [displayResult, setDisplayResult] = useState<DetectionResult | null>(null);

  useEffect(() => {
    console.log("Model loading:", modelLoading);
  }, [modelLoading]);

  useEffect(() => {
    if (!result) return;
    if (result.faceDetected) {
      noFaceFramesRef.current = 0;
      setDisplayResult(result);
    } else {
      noFaceFramesRef.current += 1;
      if (noFaceFramesRef.current >= NO_FACE_GRACE) {
        setDisplayResult(result);
      }
    }
  }, [result]);

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
    noFaceFramesRef.current = 0;
    setDisplayResult(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      stopCamera();
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

                <div className="bg-neutral-950 aspect-square sm:aspect-video flex items-center justify-center overflow-hidden relative rounded-t-xl">
                  {activeMode === "camera" ? (
                    <>
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className={`w-full h-full object-cover bg-transparent ${!stream ? "hidden" : ""}`}
                      />
                      {!stream && (
                        <div className="text-center p-6">
                          <Camera className="w-12 h-12 text-neutral-600 mx-auto mb-3" />
                          <p className="text-neutral-400 font-medium">Camera is off</p>
                          <p className="text-sm text-neutral-500 mt-1">Click start to test the detection</p>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      {image ? (
                        <img src={image} alt="Uploaded" className="w-full h-full object-contain" />
                      ) : (
                        <div className="text-center p-6">
                          <Upload className="w-12 h-12 text-neutral-600 mx-auto mb-3" />
                          <p className="text-neutral-400 font-medium">No image selected</p>
                          <p className="text-sm text-neutral-500 mt-1">Upload a photo to test</p>
                        </div>
                      )}
                    </>
                  )}
                  <canvas ref={canvasRef} style={{ display: "none" }} />

                  {/* Model loading overlay */}
                  {modelLoading && (
                    <div className="absolute inset-0 bg-neutral-950/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
                      <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                      <p className="text-sm text-neutral-300 font-medium">Loading model…</p>
                    </div>
                  )}

                  {/* Result Overlay */}
                  {displayResult && (stream || image) && (
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-md border border-white/10 px-6 py-3 flex items-center gap-4 rounded-2xl shadow-xl transition-all duration-300">
                      <div className="text-3xl">
                        {!displayResult.faceDetected ? "🫣" : displayResult.glasses ? "👓" : "😊"}
                      </div>
                      <div className="text-left">
                        <p className={`text-sm font-bold ${!displayResult.faceDetected ? "text-yellow-400" : displayResult.glasses ? "text-cyan-400" : "text-white"}`}>
                          {!displayResult.faceDetected ? "No Face Detected" : displayResult.glasses ? "Glasses Detected" : "No Glasses"}
                        </p>
                        {displayResult.faceDetected && (
                          <p className="text-xs text-neutral-400">
                            {(displayResult.probability * 100).toFixed(1)}% confidence
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

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
