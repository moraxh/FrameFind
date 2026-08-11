import { DemoSection } from "@/components/DemoSection";
import { DetectorsSection } from "@/components/DetectorsSection";
import { Footer } from "@/components/Footer";
import { HeroSection } from "@/components/HeroSection";
import { Navbar } from "@/components/Navbar";
import { PipelineDiagramSection } from "@/components/PipelineDiagramSection";
import { ProblemSection } from "@/components/ProblemSection";
import { QuickStartSection } from "@/components/QuickStartSection";
import { UseCasesSection } from "@/components/UseCasesSection";

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <main>
        <HeroSection />
        <div className="bg-[#0a0a0a] text-neutral-300">
          <DemoSection />
          <DetectorsSection />
          <ProblemSection />
          <PipelineDiagramSection />
          <QuickStartSection />
          <UseCasesSection />
        </div>
      </main>
      <Footer />
    </div>
  );
}
