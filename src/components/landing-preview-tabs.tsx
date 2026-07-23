"use client";

import { useState, type ReactNode } from "react";

export function LandingPreviewTabs({ tabs }: { tabs: { key: string; label: string; content: ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0].key);
  const activeTab = tabs.find((tab) => tab.key === active) ?? tabs[0];

  return (
    <div>
      <div role="tablist" className="flex flex-wrap gap-1.5">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={tab.key === active}
            onClick={() => setActive(tab.key)}
            className={`rounded border px-3 py-1.5 text-xs font-medium transition-colors ${
              tab.key === active
                ? "border-neutral-600 bg-neutral-200 text-neutral-950"
                : "border-neutral-800 text-neutral-400 hover:border-neutral-600 hover:text-neutral-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="mt-3">{activeTab.content}</div>
    </div>
  );
}
