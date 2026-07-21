"use client";

import { useState } from "react";
import { PERIODS } from "@/app/dashboard/shared";

const CUSTOM_RE = /^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/;

const selectClass = "min-h-8 rounded border border-neutral-800 bg-neutral-950 px-2 text-xs text-neutral-100 outline-none focus:border-amber-600/70";
const labelClass = "text-[10px] font-medium uppercase tracking-wider text-neutral-600";

// Replaces the bare `<select name="period">` in page.tsx's Apply form.
// Keeps the same GET-form contract: a single hidden `period` input carries
// either a preset value ("7") or a custom range ("YYYY-MM-DD_YYYY-MM-DD") on
// submit, so no client-side navigation/JS is required to apply it.
export function PeriodPicker({ currentPeriod }: { currentPeriod: string }) {
  const customMatch = CUSTOM_RE.exec(currentPeriod);
  const isPreset = PERIODS.some((p) => p.value === currentPeriod);

  const [mode, setMode] = useState<"preset" | "custom">(!isPreset && customMatch ? "custom" : "preset");
  const [preset, setPreset] = useState(isPreset ? currentPeriod : "7");
  const [start, setStart] = useState(customMatch?.[1] ?? "");
  const [end, setEnd] = useState(customMatch?.[2] ?? "");

  const hiddenValue = mode === "custom" && start && end ? `${start}_${end}` : preset;

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="grid gap-1">
        <span className={labelClass}>Period</span>
        <select
          value={mode === "custom" ? "custom" : preset}
          onChange={(e) => {
            if (e.target.value === "custom") {
              setMode("custom");
            } else {
              setMode("preset");
              setPreset(e.target.value);
            }
          }}
          className={selectClass}
        >
          {PERIODS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
          <option value="custom">Custom…</option>
        </select>
      </label>
      {mode === "custom" && (
        <>
          <label className="grid gap-1">
            <span className={labelClass}>From</span>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              max={end || undefined}
              className={selectClass}
            />
          </label>
          <label className="grid gap-1">
            <span className={labelClass}>To</span>
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              min={start || undefined}
              className={selectClass}
            />
          </label>
        </>
      )}
      <input type="hidden" name="period" value={hiddenValue} />
    </div>
  );
}
