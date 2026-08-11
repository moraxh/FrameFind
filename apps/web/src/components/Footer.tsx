import { ScanEyeIcon } from "./ScanEyeIcon";

export function Footer() {
  return (
    <footer className="border-t border-neutral-800/80 bg-[#0a0a0a] py-12 px-6">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-2">
          <ScanEyeIcon className="w-5 h-5 text-neutral-500" />
          <span className="text-sm text-neutral-400">FrameFind SDK</span>
        </div>
        <div className="flex items-center gap-6 text-sm text-neutral-500">
          <a href="https://github.com/moraxh/FrameFind" className="hover:text-neutral-300 transition-colors">
            GitHub
          </a>
          <a href="https://www.npmjs.com/search?q=%40framefind" className="hover:text-neutral-300 transition-colors">
            npm registry
          </a>
          <a href="https://github.com/moraxh/FrameFind/blob/main/LICENSE" className="hover:text-neutral-300 transition-colors">
            License MIT
          </a>
        </div>
      </div>
      <div className="max-w-6xl mx-auto mt-6 pt-6 border-t border-neutral-800/40 flex justify-center">
        <p className="text-xs text-neutral-600">
          Built by{" "}
          <a
            href="https://github.com/moraxh"
            target="_blank"
            rel="noopener noreferrer"
            className="text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            Jorge Mora
          </a>
          {" "}— built for private, real-time interfaces
        </p>
      </div>
    </footer>
  );
}
