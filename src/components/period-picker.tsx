"use client";

import { useState } from "react";
import { PERIODS } from "@/app/dashboard/shared";
import { FilterSelect } from "./filter-select";

const CUSTOM_RE = /^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/;

const selectClass = "filter-control";
const labelClass = "field-label";

// Replaces the bare `<select name="period">` in page.tsx's Apply form.
// Keeps the same GET-form contract: a single hidden `period` input carries
// either a preset value ("7") or a custom range ("YYYY-MM-DD_YYYY-MM-DD") on
// submit. QueryForm applies it without losing the other selected filters.
export function PeriodPicker({ currentPeriod }: { currentPeriod: string }) {
  const customMatch = CUSTOM_RE.exec(currentPeriod);
  const isPreset = PERIODS.some((p) => p.value === currentPeriod);

  const [mode, setMode] = useState<"preset" | "custom">(!isPreset && customMatch ? "custom" : "preset");
  const [preset, setPreset] = useState(isPreset ? currentPeriod : "7");
  const [start, setStart] = useState(customMatch?.[1] ?? "");
  const [end, setEnd] = useState(customMatch?.[2] ?? "");

  const hiddenValue = mode === "custom" && start && end ? `${start}_${end}` : preset;

  return (
    <div className="period-picker">
        <FilterSelect label="Period" options={[...PERIODS, { value: "custom", label: "Custom range" }]}
          value={mode === "custom" ? "custom" : preset}
          onChange={(value) => {
            if (value === "custom") {
              setMode("custom");
            } else {
              setMode("preset");
              setPreset(value);
            }
          }}
        />
      {mode === "custom" && (
        <>
          <label className="grid gap-1">
            <span className={labelClass}>From</span>
            <input
              type="date"
              required
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
              required
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
