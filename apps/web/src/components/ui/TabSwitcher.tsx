"use client";

import React from "react";

export interface TabItem<T extends string = string> {
  id: T;
  label: string;
  icon?: React.ReactNode;
}

interface TabSwitcherProps<T extends string = string> {
  tabs: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  variant?: "pill" | "underline";
  ariaLabel?: string;
  panelIdPrefix?: string;
}

export function TabSwitcher<T extends string = string>({
  tabs,
  value,
  onChange,
  variant = "underline",
  ariaLabel = "Tab navigation",
  panelIdPrefix = "tab-panel",
}: TabSwitcherProps<T>) {
  const handleKeyDown = (e: React.KeyboardEvent, idx: number) => {
    const lastIdx = tabs.length - 1;
    let next = idx;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      next = idx === lastIdx ? 0 : idx + 1;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      next = idx === 0 ? lastIdx : idx - 1;
    } else if (e.key === "Home") {
      e.preventDefault();
      next = 0;
    } else if (e.key === "End") {
      e.preventDefault();
      next = lastIdx;
    } else {
      return;
    }
    onChange(tabs[next].id);
    const el = document.getElementById(`tab-btn-${panelIdPrefix}-${tabs[next].id}`);
    el?.focus();
  };

  if (variant === "pill") {
    return (
      <div role="tablist" aria-label={ariaLabel} className="flex gap-2">
        {tabs.map((tab, idx) => (
          <button
            key={tab.id}
            id={`tab-btn-${panelIdPrefix}-${tab.id}`}
            role="tab"
            type="button"
            aria-selected={value === tab.id}
            aria-controls={`${panelIdPrefix}-${tab.id}`}
            tabIndex={value === tab.id ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className={`px-5 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-cyan-400 focus-visible:outline-offset-2 ${
              value === tab.id
                ? "bg-cyan-500 text-white shadow-lg shadow-cyan-500/20"
                : "bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div role="tablist" aria-label={ariaLabel} className="flex border-b border-neutral-800">
      {tabs.map((tab, idx) => (
        <button
          key={tab.id}
          id={`tab-btn-${panelIdPrefix}-${tab.id}`}
          role="tab"
          type="button"
          aria-selected={value === tab.id}
          aria-controls={`${panelIdPrefix}-${tab.id}`}
          tabIndex={value === tab.id ? 0 : -1}
          onClick={() => onChange(tab.id)}
          onKeyDown={(e) => handleKeyDown(e, idx)}
          className={`px-5 py-2.5 text-xs font-mono transition-colors flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-cyan-400 focus-visible:outline-offset-[-2px] ${
            value === tab.id
              ? "border-b border-cyan-400 text-white bg-white/5"
              : "text-neutral-500 hover:text-neutral-300 hover:bg-white/[0.02]"
          }`}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}
