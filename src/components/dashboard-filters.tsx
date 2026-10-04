"use client";

import { useRef, useState, type ReactNode } from "react";

export function DashboardFilters({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return <div className="dashboard-filter-shell" onSubmitCapture={() => setOpen(false)} onKeyDown={event => {
    if (event.key === "Escape" && open) { setOpen(false); trigger.current?.focus(); }
  }}>
    <button ref={trigger} type="button" className="mobile-filter-toggle" aria-expanded={open} aria-controls="dashboard-filter-panel" onClick={() => setOpen(!open)}>Filters <span aria-hidden="true">{open ? "−" : "+"}</span></button>
    <div id="dashboard-filter-panel" className="dashboard-filter-panel" data-expanded={open}>{children}</div>
  </div>;
}
