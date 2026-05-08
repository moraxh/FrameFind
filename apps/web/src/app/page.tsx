"use client";

import { useState, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { HeroSection } from "@/components/HeroSection";
import { ProblemSection } from "@/components/ProblemSection";
import { DemoSection } from "@/components/DemoSection";
import { PipelineSection } from "@/components/PipelineSection";
import { QuickStartSection } from "@/components/QuickStartSection";
import { MetricsSection } from "@/components/MetricsSection";
import { ArchitectureSection } from "@/components/ArchitectureSection";
import { RoadmapSection } from "@/components/RoadmapSection";
import { DocsSection } from "@/components/DocsSection";
import { Footer } from "@/components/Footer";

type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

function getInstallCommand(pm: PackageManager): string {
  switch (pm) {
    case "pnpm":
      return "pnpm add @framefind/core";
    case "yarn":
      return "yarn add @framefind/core";
    case "bun":
      return "bun add @framefind/core";
    default:
      return "npm install @framefind/core";
  }
}

export default function LandingPage() {
  const [packageManager, setPackageManager] = useState<PackageManager>("npm");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("packageManager") as PackageManager;
    if (["npm", "pnpm", "yarn", "bun"].includes(saved)) setPackageManager(saved);
  }, []);

  const installCommand = mounted ? getInstallCommand(packageManager) : "npm install @framefind/core";

  return (
    <div className="min-h-screen">
      <Navbar />
      <main>
        <HeroSection installCommand={installCommand} />
        <div className="max-w-6xl mx-auto px-6">
          <div className="h-px bg-neutral-800/60 w-full" />
        </div>
        <DemoSection />
        <div className="max-w-6xl mx-auto px-6">
          <div className="h-px bg-neutral-800/60 w-full" />
        </div>
        <ProblemSection />
        <PipelineSection />
        <QuickStartSection />
        <div className="max-w-6xl mx-auto px-6">
          <div className="h-px bg-neutral-800/60 w-full" />
        </div>
        <MetricsSection />
        <ArchitectureSection />
        <RoadmapSection />
        <DocsSection />
      </main>
      <Footer />
    </div>
  );
}
