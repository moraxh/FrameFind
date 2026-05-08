"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

interface CodeBlockProps {
  code: string;
  language?: string;
  plain?: boolean;
  showCopy?: boolean;
}

export function CodeBlock({ code, language = "bash", plain = false, showCopy = true }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (plain) {
    return (
      <div className="relative rounded-lg bg-neutral-900 shadow-sm border border-neutral-800 overflow-hidden w-full">
        <div className="absolute top-3 right-3 z-10">
          <button
            onClick={handleCopy}
            className="p-2 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200 transition-colors"
            title="Copy code"
          >
            {copied ? (
              <Check className="w-4 h-4" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
        </div>
        <div className="p-4 overflow-x-auto">
          <pre className="font-mono text-[13px] leading-relaxed text-neutral-300">
            <code>{code}</code>
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="relative rounded-lg bg-neutral-900 shadow-sm border border-neutral-800 overflow-hidden w-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-800 bg-[#0d0d0d]">
        <div className="flex items-center gap-4">
          <div className="flex space-x-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-neutral-700" />
            <div className="w-2.5 h-2.5 rounded-full bg-neutral-700" />
            <div className="w-2.5 h-2.5 rounded-full bg-neutral-700" />
          </div>
          <span className="text-[11px] font-mono tracking-wide uppercase text-neutral-500">
            {language}
          </span>
        </div>
        {showCopy && (
          <button
            onClick={handleCopy}
            className="p-1.5 rounded-md bg-neutral-800/50 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 transition-colors"
            title="Copy code"
          >
            {copied ? (
              <Check className="w-4 h-4" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
        )}
      </div>
      <div className="p-4 overflow-x-auto">
        <pre className="font-mono text-[13px] leading-relaxed text-neutral-300">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}
