"use client";

import { useState, useRef, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { FadeIn } from "@/components/FadeIn";
import { CodeBlock } from "@/components/CodeBlock";
import { Camera, Upload, Eye } from "lucide-react";

type DemoTab = "camera" | "upload" | "code";

export default function DemoPage() {
  const [activeTab, setActiveTab] = useState<DemoTab>("camera");
  const [packageManager, setPackageManager] = useState<"npm" | "pnpm" | "yarn" | "bun">("pnpm");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("packageManager") as any;
    if (["npm", "pnpm", "yarn", "bun"].includes(saved)) setPackageManager(saved);
  }, []);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      alert("Camera access denied or not available");
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          if (canvasRef.current) {
            canvasRef.current.width = img.width;
            canvasRef.current.height = img.height;
            const ctx = canvasRef.current.getContext("2d");
            if (ctx) {
              ctx.drawImage(img, 0, 0);
            }
          }
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const installCmd = mounted
    ? `${packageManager} add @framefind/react onnxruntime-web`
    : "npm install @framefind/react onnxruntime-web";

  const reactCode = `"use client";

import { useRef } from 'react';
import { useGlassesDetector } from '@framefind/react';

export function GlassesDemo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { result, loading, error, detect } = useGlassesDetector({
    modelUrl: '/models/glasses.onnx',
    threshold: 0.35,
    smoothingWindow: 8,
  });

  const handleDetect = async () => {
    if (videoRef.current && canvasRef.current) {
      await detect(videoRef.current, canvasRef.current);
    }
  };

  return (
    <div className="space-y-4">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full rounded-lg"
      />
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      {loading && <p>Detecting...</p>}
      {error && <p className="text-red-500">Error: {error.message}</p>}
      {result && (
        <div className="p-4 bg-neutral-900 rounded-lg">
          <p>{result.glasses ? '👓 Glasses Detected' : '😊 No Glasses'}</p>
          <p>Confidence: {(result.probability * 100).toFixed(1)}%</p>
        </div>
      )}
      <button
        onClick={handleDetect}
        className="w-full px-4 py-2 bg-cyan-500 hover:bg-cyan-600 rounded-lg text-white"
      >
        Detect Glasses
      </button>
    </div>
  );
}`;

  const browserCode = `import { GlassesDetector } from '@framefind/core';

const detector = new GlassesDetector({
  modelUrl: '/models/glasses.onnx',
  threshold: 0.35,
  smoothingWindow: 8,
});

await detector.load();

const video = document.getElementById('video') as HTMLVideoElement;
const canvas = document.createElement('canvas');

const result = await detector.detectFromVideoFrame(video, canvas);
console.log('Glasses detected:', result.glasses);
console.log('Confidence:', (result.probability * 100).toFixed(1) + '%');

await detector.dispose();`;

  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-950 to-black">
      <Navbar />

      <main className="max-w-6xl mx-auto px-6 py-24">
        <FadeIn>
          <div className="text-center mb-16">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-4">
              Live Demo
            </h1>
            <p className="text-lg text-neutral-400 max-w-2xl mx-auto">
              Try FrameFind real-time glasses detection. Upload an image or use your camera.
            </p>
          </div>
        </FadeIn>

        <FadeIn delay={0.1}>
          <div className="grid lg:grid-cols-2 gap-12 mb-16">
            {/* Demo Section */}
            <div className="space-y-6">
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
                <div className="flex border-b border-neutral-800">
                  {(["camera", "upload"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => {
                        setActiveTab(tab);
                        if (tab === "upload") stopCamera();
                      }}
                      className={`flex-1 px-4 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                        activeTab === tab
                          ? "border-b-2 border-cyan-400 text-white bg-white/5"
                          : "text-neutral-500 hover:text-neutral-300"
                      }`}
                    >
                      {tab === "camera" ? (
                        <>
                          <Camera className="w-4 h-4" />
                          Camera
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4" />
                          Upload
                        </>
                      )}
                    </button>
                  ))}
                </div>

                <div className="p-6 bg-black/40 min-h-[400px] flex flex-col items-center justify-center">
                  {activeTab === "camera" ? (
                    <div className="w-full space-y-4">
                      {stream ? (
                        <>
                          <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className="w-full rounded-lg bg-black"
                          />
                          <div className="flex gap-3">
                            <button
                              onClick={() => {
                                if (videoRef.current && canvasRef.current) {
                                  const ctx = canvasRef.current.getContext("2d");
                                  if (ctx) {
                                    canvasRef.current.width = videoRef.current.videoWidth;
                                    canvasRef.current.height = videoRef.current.videoHeight;
                                    ctx.drawImage(videoRef.current, 0, 0);
                                  }
                                }
                              }}
                              className="flex-1 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
                            >
                              <Eye className="w-4 h-4" />
                              Detect
                            </button>
                            <button
                              onClick={stopCamera}
                              className="flex-1 px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-white rounded-lg font-medium transition-colors"
                            >
                              Stop
                            </button>
                          </div>
                        </>
                      ) : (
                        <button
                          onClick={startCamera}
                          className="w-full px-6 py-3 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
                        >
                          <Camera className="w-5 h-5" />
                          Start Camera
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="w-full space-y-4">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full px-6 py-3 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
                      >
                        <Upload className="w-5 h-5" />
                        Choose Image
                      </button>
                      <canvas
                        ref={canvasRef}
                        className="w-full rounded-lg bg-black max-h-[300px]"
                        style={{ display: "block" }}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-4 flex items-start gap-3">
                <Eye className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-cyan-300 mb-1">Demo Ready</p>
                  <p className="text-cyan-200/80">
                    This is a UI demonstration. To use actual detection, install the package and configure your model.
                  </p>
                </div>
              </div>
            </div>

            {/* Installation Section */}
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-white mb-4">Get Started</h3>
                <p className="text-sm text-neutral-400 mb-6">
                  Install FrameFind React hooks and required dependencies for real-time detection.
                </p>
              </div>

              <div className="space-y-3">
                <label className="block text-sm text-neutral-300 font-medium">
                  Package Manager
                </label>
                <div className="flex gap-2 mb-4">
                  {(["npm", "pnpm", "yarn", "bun"] as const).map((pm) => (
                    <button
                      key={pm}
                      onClick={() => {
                        setPackageManager(pm);
                        localStorage.setItem("packageManager", pm);
                      }}
                      className={`px-3 py-1.5 text-xs font-mono rounded-md transition-colors ${
                        packageManager === pm
                          ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/50"
                          : "bg-neutral-800 text-neutral-400 hover:text-neutral-300"
                      }`}
                    >
                      {pm}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-mono text-neutral-500 uppercase tracking-wide">
                  Installation
                </label>
                <CodeBlock code={installCmd} language="bash" />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-mono text-neutral-500 uppercase tracking-wide">
                  React Hook Usage
                </label>
                <CodeBlock code={reactCode} language="tsx" />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-mono text-neutral-500 uppercase tracking-wide">
                  Core API Usage
                </label>
                <CodeBlock code={browserCode} language="typescript" />
              </div>

              <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 space-y-3">
                <h4 className="font-medium text-white text-sm">Configuration Options</h4>
                <ul className="text-sm text-neutral-300 space-y-2">
                  <li className="flex gap-2">
                    <span className="text-cyan-400 flex-shrink-0">•</span>
                    <span>
                      <strong>threshold</strong>: Detection confidence level (0-1, default: 0.35)
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-cyan-400 flex-shrink-0">•</span>
                    <span>
                      <strong>smoothingWindow</strong>: Frames for smoothing results (default: 8)
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-cyan-400 flex-shrink-0">•</span>
                    <span>
                      <strong>modelUrl/modelPath</strong>: Path to glasses detection ONNX model
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </FadeIn>
      </main>

      <Footer />
    </div>
  );
}
