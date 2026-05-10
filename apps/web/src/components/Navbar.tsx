import { GithubIcon } from "./GithubIcon";
import { ScanEyeIcon } from "./ScanEyeIcon";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 bg-[#0a0a0a]/90 backdrop-blur-md border-b border-neutral-800/60">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <ScanEyeIcon className="w-5 h-5 text-cyan-400" />

          <span className="font-semibold text-neutral-100 tracking-tight">
            FrameFind
          </span>
        </div>

        <nav aria-label="Primary" className="flex items-center gap-6">
          <a href="/docs" className="hover:opacity-60 transition-opacity">
            Docs
          </a>

          <a
            href="https://github.com/moraxh/FrameFind"
            target="_blank"
            rel="noopener noreferrer"
            className="
							group
							inline-flex
							items-center
							gap-2
							rounded-lg
							border
							border-neutral-800
							bg-white/[0.03]
							px-3
							py-1.5
							text-sm
							font-medium
							text-neutral-300
							transition-all
							duration-200
							hover:border-neutral-700
							hover:bg-white/[0.06]
							hover:text-white
						"
          >
            <GithubIcon className="w-4 h-4 transition-transform group-hover:scale-110" />

            <span>Star on GitHub</span>

            <span
              className="
								rounded-md
								bg-white/5
								px-1.5
								py-0.5
								text-xs
								text-neutral-400
								group-hover:text-neutral-200
							"
            >
              ★
            </span>
          </a>
        </nav>
      </div>
    </header>
  );
}
