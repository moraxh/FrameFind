import { GithubIcon } from "./GithubIcon";
import { ScanEyeIcon } from "./ScanEyeIcon";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 bg-[#0a0a0a]/80 backdrop-blur-md border-b border-neutral-800/80">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ScanEyeIcon className="w-5 h-5 text-cyan-400" />
          <span className="font-medium text-neutral-100 tracking-tight">FrameFind</span>
        </div>
        <nav className="flex items-center gap-6">
          <a href="#docs" className="text-sm text-neutral-400 hover:text-neutral-100 transition-colors">
            Docs
          </a>
          <a
            href="https://github.com/moraxh/FrameFind"
            className="text-sm text-neutral-400 hover:text-neutral-100 transition-colors flex items-center gap-1.5"
          >
            <GithubIcon className="w-4 h-4" />
            <span>GitHub</span>
          </a>
        </nav>
      </div>
    </header>
  );
}
