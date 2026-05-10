"use client";

import { useHeadPoseDetector } from "@framefind/react";
import { Camera } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const CONNECTIONS = [
  [10, 338],
  [338, 297],
  [297, 332],
  [332, 284],
  [284, 251],
  [251, 389],
  [389, 356],
  [356, 454],
  [454, 323],
  [323, 361],
  [361, 288],
  [288, 397],
  [397, 365],
  [365, 379],
  [379, 378],
  [378, 400],
  [400, 377],
  [377, 152],
  [152, 148],
  [148, 176],
  [176, 149],
  [149, 150],
  [150, 136],
  [136, 172],
  [172, 58],
  [58, 132],
  [132, 93],
  [93, 234],
  [234, 127],
  [127, 162],
  [162, 21],
  [21, 54],
  [54, 103],
  [103, 67],
  [67, 109],
  [109, 10],
];

function drawLandmarks(
  ctx: CanvasRenderingContext2D,
  landmarks: { x: number; y: number }[],
  w: number,
  h: number,
) {
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(34,211,238,0.35)";
  ctx.lineWidth = 1;
  for (const [a, b] of CONNECTIONS) {
    const A = landmarks[a],
      B = landmarks[b];
    if (!A || !B) continue;
    ctx.beginPath();
    ctx.moveTo((1 - A.x) * w, A.y * h);
    ctx.lineTo((1 - B.x) * w, B.y * h);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(34,211,238,0.5)";
  for (const [a] of CONNECTIONS) {
    const pt = landmarks[a];
    if (!pt) continue;
    ctx.beginPath();
    ctx.arc((1 - pt.x) * w, pt.y * h, 1, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ─── Angle Gauge ──────────────────────────────────────────────────────────────

function AngleGauge({
  label,
  value,
  max = 45,
}: {
  label: string;
  value: number;
  max?: number;
}) {
  const pct = Math.min(Math.abs(value) / max, 1);
  const isPositive = value >= 0;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono text-neutral-600 uppercase tracking-widest">
          {label}
        </span>
        <span className="text-xs font-mono tabular-nums text-white font-semibold">
          {value >= 0 ? "+" : ""}
          {value.toFixed(1)}°
        </span>
      </div>
      {/* Bi-directional bar */}
      <div className="relative h-1 bg-neutral-800 rounded-full overflow-hidden">
        {/* Center mark */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-neutral-700 -translate-x-1/2" />
        <motion.div
          className="absolute top-0 bottom-0 bg-cyan-400 rounded-full"
          style={{
            left: isPositive ? "50%" : `${50 - pct * 50}%`,
            width: `${pct * 50}%`,
          }}
          animate={{
            left: isPositive ? "50%" : `${50 - pct * 50}%`,
            width: `${pct * 50}%`,
          }}
          transition={{ type: "spring", stiffness: 200, damping: 25 }}
        />
      </div>
    </div>
  );
}

// ─── HeadPoseDemo ─────────────────────────────────────────────────────────────

export function HeadPoseDemo() {
  const lmCanvasRef = useRef<HTMLCanvasElement>(null);
  const threeContainerRef = useRef<HTMLDivElement>(null);
  const threeRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    head: THREE.Object3D | null;
    raf: number;
  } | null>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [mounted, setMounted] = useState(false);

  const {
    videoRef,
    result,
    loading: modelLoading,
  } = useHeadPoseDetector({
    enabled: true,
    inferenceIntervalMs: 0,
    uiUpdateIntervalMs: 0,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  // Init Three.js
  useEffect(() => {
    if (!mounted) return;
    const el = threeContainerRef.current;
    if (!el) return;

    let initialized = false;
    let ro: ResizeObserver | null = null;

    const init = (w: number, h: number) => {
      if (initialized) return;
      initialized = true;

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
      });
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(0x000000, 0);
      const canvas = renderer.domElement;
      canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
      el.appendChild(canvas);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, w / h, 0.01, 1000);
      camera.position.set(0, 0, 4);
      camera.lookAt(0, 0, 0);

      scene.add(new THREE.AmbientLight(0xffffff, 1.2));
      const dir = new THREE.DirectionalLight(0xffffff, 2);
      dir.position.set(2, 4, 3);
      scene.add(dir);
      const fill = new THREE.DirectionalLight(0x88ccff, 0.6);
      fill.position.set(-2, 0, -2);
      scene.add(fill);

      let head: THREE.Object3D | null = null;

      const three = {
        renderer,
        scene,
        camera,
        head: null as THREE.Object3D | null,
        raf: 0,
      };
      threeRef.current = three;

      new GLTFLoader().load(
        "/geisha.glb",
        (gltf) => {
          const inner = gltf.scene;
          const box = new THREE.Box3().setFromObject(inner);
          const center = new THREE.Vector3();
          const size = new THREE.Vector3();
          box.getCenter(center);
          box.getSize(size);
          const maxDim = Math.max(size.x, size.y, size.z) || 1;
          const scale = 2 / maxDim;
          inner.position.set(-center.x, -center.y, -center.z);
          inner.scale.setScalar(scale);

          const pivot = new THREE.Group();
          const wrapper = new THREE.Group();
          wrapper.add(inner);
          pivot.add(wrapper);
          scene.add(pivot);

          head = pivot;
          three.head = pivot;
        },
        undefined,
        (err) => console.error("[HeadPose] GLTF load failed:", err),
      );

      const renderLoop = () => {
        three.raf = requestAnimationFrame(renderLoop);
        renderer.render(scene, camera);
      };
      renderLoop();
    };

    const onResize = (entries: ResizeObserverEntry[]) => {
      const { width: w, height: h } = entries[0].contentRect;
      if (w === 0 || h === 0) return;
      if (!threeRef.current) {
        init(w, h);
        return;
      }
      threeRef.current.renderer.setSize(w, h);
      threeRef.current.camera.aspect = w / h;
      threeRef.current.camera.updateProjectionMatrix();
    };

    ro = new ResizeObserver(onResize);
    ro.observe(el);

    const onWindowResize = () => {
      if (!threeRef.current || !el) return;
      const w = el.clientWidth,
        h = el.clientHeight;
      if (!w || !h) return;
      threeRef.current.renderer.setSize(w, h);
      threeRef.current.camera.aspect = w / h;
      threeRef.current.camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onWindowResize);

    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", onWindowResize);
      if (threeRef.current) {
        cancelAnimationFrame(threeRef.current.raf);
        threeRef.current.renderer.dispose();
        if (el.contains(threeRef.current.renderer.domElement)) {
          el.removeChild(threeRef.current.renderer.domElement);
        }
        threeRef.current = null;
      }
    };
  }, [mounted]);

  // Apply pose
  useEffect(() => {
    if (!result || !threeRef.current?.head) return;
    const DEG = Math.PI / 180;
    const head = threeRef.current.head;
    head.rotation.y = -result.yaw * DEG;
    head.rotation.x = result.pitch * DEG;
    head.rotation.z = -result.roll * DEG;
  }, [result]);

  // Draw landmarks
  useEffect(() => {
    const lmCanvas = lmCanvasRef.current;
    const video = videoRef.current;
    if (!lmCanvas) return;
    const ctx = lmCanvas.getContext("2d");
    if (!ctx) return;

    if (result?.faceDetected && result.landmarks && video) {
      lmCanvas.width = video.videoWidth || lmCanvas.offsetWidth;
      lmCanvas.height = video.videoHeight || lmCanvas.offsetHeight;
      drawLandmarks(ctx, result.landmarks, lmCanvas.width, lmCanvas.height);
    } else {
      ctx.clearRect(0, 0, lmCanvas.width, lmCanvas.height);
    }
  }, [result, videoRef.current]);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
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
    stream?.getTracks().forEach((t) => {
      t.stop();
    });
    setStream(null);
    if (videoRef.current) videoRef.current.srcObject = null;
    if (threeRef.current?.head) threeRef.current.head.rotation.set(0, 0, 0);
    const lmCanvas = lmCanvasRef.current;
    if (lmCanvas) {
      const ctx = lmCanvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, lmCanvas.width, lmCanvas.height);
    }
  };

  if (!mounted) return null;

  const hasPose = stream && result?.faceDetected;

  return (
    <div className="bg-neutral-950 border border-neutral-800/60 rounded-2xl overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-neutral-800/60 bg-neutral-900/30">
        <div
          className={`w-2 h-2 rounded-full ${stream ? "bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.5)]" : "bg-neutral-700"} transition-all`}
        />
        <span className="text-xs font-mono text-neutral-500">
          {modelLoading
            ? "Loading model…"
            : stream
              ? "Live · Head Pose"
              : "Head Pose Estimator"}
        </span>
        {modelLoading && (
          <div className="ml-auto w-3.5 h-3.5 border-2 border-cyan-400/60 border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      {/* Main split: camera | 3D */}
      <div className="grid grid-cols-2">
        {/* Camera + landmarks */}
        <div className="relative aspect-[4/3] bg-black border-r border-neutral-800/60 overflow-hidden">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover [transform:scaleX(-1)] ${!stream ? "hidden" : ""}`}
          />
          <canvas
            ref={lmCanvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
          />
          {!stream && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <Camera className="w-7 h-7 text-neutral-700" />
              <p className="text-xs text-neutral-600 font-mono">Camera off</p>
            </div>
          )}
        </div>

        {/* Three.js */}
        <div
          ref={threeContainerRef}
          role="img"
          aria-label="3D head pose visualization"
          className="relative aspect-[4/3] bg-neutral-950 overflow-hidden min-h-0"
        >
          {/* Subtle grid bg */}
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.04]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(34,211,238,1) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,1) 1px, transparent 1px)",
              backgroundSize: "24px 24px",
            }}
          />
          <div className="absolute top-2 right-2 bg-black/50 backdrop-blur-sm px-1.5 py-0.5 rounded text-[9px] text-neutral-600 font-mono tracking-widest uppercase z-10">
            3D
          </div>
          {!stream && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10">
              <p className="text-xs text-neutral-700 font-mono">
                Waiting for input
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Angle readouts */}
      <div
        className="px-4 py-3.5 border-t border-neutral-800/60 bg-neutral-900/20 space-y-2.5"
        aria-live="polite"
        aria-atomic="true"
      >
        <AnimatePresence mode="wait">
          {hasPose && result ? (
            <motion.div
              key="gauges"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="space-y-2.5"
            >
              <AngleGauge label="Yaw" value={result.yaw} />
              <AngleGauge label="Pitch" value={result.pitch} />
              <AngleGauge label="Roll" value={result.roll} />
            </motion.div>
          ) : (
            <motion.div
              key="placeholder"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="space-y-2.5"
            >
              {["Yaw", "Pitch", "Roll"].map((label) => (
                <div key={label} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-neutral-700 uppercase tracking-widest">
                      {label}
                    </span>
                    <span className="text-xs font-mono text-neutral-700">
                      —
                    </span>
                  </div>
                  <div className="h-1 bg-neutral-800/60 rounded-full" />
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <p
          className={`text-[11px] font-mono text-center pt-0.5 transition-opacity duration-200 ${stream && result && !result.faceDetected ? "text-yellow-500/80 opacity-100" : "opacity-0 select-none"}`}
        >
          No face detected
        </p>
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
