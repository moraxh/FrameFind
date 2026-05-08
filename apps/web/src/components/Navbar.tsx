import { GithubIcon } from "./GithubIcon";
import { ScanEyeIcon } from "./ScanEyeIcon";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 bg-[#0a0a0a]/90 backdrop-blur-md border-b border-neutral-800/60">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <ScanEyeIcon className="w-5 h-5 text-cyan-400" />
          <span className="font-semibold text-neutral-100 tracking-tight">FrameFind</span>
          <span className="hidden sm:inline-block text-[10px] font-mono px-1.5 py-0.5 rounded border border-cyan-900/60 bg-cyan-950/30 text-cyan-500 uppercase tracking-wider ml-1">
            SDK
          </span>
        </div>
        <nav aria-label="Primary" className="flex items-center gap-1">
          <a href="#detectors" className="px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-100 hover:bg-white/5 rounded-md transition-colors">
            Detectors
          </a>
          <a href="#roadmap" className="px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-100 hover:bg-white/5 rounded-md transition-colors">
            Roadmap
          </a>
          <a href="#docs" className="px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-100 hover:bg-white/5 rounded-md transition-colors">
            Docs
          </a>
          <a
            href="https://github.com/moraxh/FrameFind"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-100 hover:bg-white/5 rounded-md transition-colors flex items-center gap-1.5 border border-neutral-800 hover:border-neutral-700"
          >
            <GithubIcon className="w-4 h-4" />
            <span className="hidden sm:inline">GitHub</span>
          </a>
        </nav>
      </div>
    </header>
  );
}
