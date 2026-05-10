"use client";

import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { ScanEyeIcon } from "@/components/ScanEyeIcon";

export function baseOptions(): BaseLayoutProps {
  return {
    searchToggle: {
      enabled: true,
    },
    nav: {
      title: (
        <div className="flex items-center gap-2">
          <ScanEyeIcon className="w-6 h-6 text-cyan-400" />
          <span className="font-semibold text-neutral-100 tracking-tight text-lg">
            FrameFind
          </span>
        </div>
      ),
      url: "/",
    },
    slots: {
      themeSwitch: false,
    },
  };
}
