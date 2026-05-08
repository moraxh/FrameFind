import { Navbar } from "@/components/Navbar";
import { HeroSection } from "@/components/HeroSection";
import { DetectorsSection } from "@/components/DetectorsSection";
import { DemoSection } from "@/components/DemoSection";
import { ProblemSection } from "@/components/ProblemSection";
import { QuickStartSection } from "@/components/QuickStartSection";
import { RoadmapSection } from "@/components/RoadmapSection";
import { MetricsSection } from "@/components/MetricsSection";
import { PipelineDiagramSection } from "@/components/PipelineDiagramSection";
import { UseCasesSection } from "@/components/UseCasesSection";
import { DocsSection } from "@/components/DocsSection";
import { Footer } from "@/components/Footer";

function Divider() {
  return (
    <div className="max-w-6xl mx-auto px-6">
      <div className="h-px bg-neutral-800/60 w-full" />
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <main>
        <HeroSection />
        <Divider />
        <DetectorsSection />
        <Divider />
        <PipelineDiagramSection />
        <Divider />
        <DemoSection />
        <Divider />
        <ProblemSection />
        <Divider />
        <UseCasesSection />
        <Divider />
        <QuickStartSection />
        <Divider />
        <RoadmapSection />
        <MetricsSection />
        <DocsSection />
      </main>
      <Footer />
    </div>
  );
}
