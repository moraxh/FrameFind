import { DemoSection } from "@/components/DemoSection";
import { DetectorsSection } from "@/components/DetectorsSection";
import { Footer } from "@/components/Footer";
import { HeroSection } from "@/components/HeroSection";
import { Navbar } from "@/components/Navbar";
import { PipelineDiagramSection } from "@/components/PipelineDiagramSection";
import { ProblemSection } from "@/components/ProblemSection";
import { QuickStartSection } from "@/components/QuickStartSection";
import { UseCasesSection } from "@/components/UseCasesSection";

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
				<DemoSection />
				<Divider />
				<DetectorsSection />
				<Divider />
				<PipelineDiagramSection />
				<Divider />
				<ProblemSection />
				<Divider />
				<UseCasesSection />
				<Divider />
				<QuickStartSection />
				<Divider />
			</main>
			<Footer />
		</div>
	);
}
