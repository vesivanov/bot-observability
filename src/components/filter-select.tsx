"use client";

import { useEffect, useId, useRef, useState } from "react";

interface SelectOption {
  value: string;
  label: string;
}

/** A form-compatible selector with the same keyboard contract as a select. */
export function FilterSelect({
  label, name, options, value, defaultValue = "", onChange, className = "",
}: {
  label: string;
  name?: string;
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  className?: string;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const typeahead = useRef({ value: "", at: 0 });
  const [selected, setSelected] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const current = value ?? selected;
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === current));

  useEffect(() => {
    if (!open) return;
    function dismiss(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  useEffect(() => {
    if (open) root.current?.querySelector(`[data-option-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    setSelected(option.value);
    onChange?.(option.value);
    setOpen(false);
    trigger.current?.focus();
  }

  return (
    <div ref={root} className={`filter-field filter-select ${className}`}>
      <span id={`${id}-label`} className="field-label">{label}</span>
      {name && <input type="hidden" name={name} value={current} />}
      <button
        ref={trigger}
        type="button"
        role="combobox"
        aria-labelledby={`${id}-label ${id}-value`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-options`}
        aria-activedescendant={open ? `${id}-option-${active}` : undefined}
        className="filter-control filter-select-trigger"
        onClick={() => { setActive(selectedIndex); setOpen(!open); }}
        onKeyDown={(event) => {
          if (event.key === "Escape" || event.key === "Tab") { setOpen(false); return; }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) { setActive(selectedIndex); setOpen(true); }
            else setActive((index) => (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
          } else if (event.key === "Home" || event.key === "End") {
            event.preventDefault(); setOpen(true); setActive(event.key === "Home" ? 0 : options.length - 1);
          } else if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (open) choose(active);
            else { setActive(selectedIndex); setOpen(true); }
          } else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
            const now = Date.now();
            typeahead.current = { value: (now - typeahead.current.at < 700 ? typeahead.current.value : "") + event.key.toLowerCase(), at: now };
            const match = options.findIndex((option) => option.label.toLowerCase().startsWith(typeahead.current.value));
            if (match >= 0) { event.preventDefault(); setActive(match); setOpen(true); }
          }
        }}
      >
        <span id={`${id}-value`} className="truncate" title={options[selectedIndex]?.label ?? current}>{options[selectedIndex]?.label ?? current}</span>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <div id={`${id}-options`} role="listbox" aria-labelledby={`${id}-label`} className="filter-options">
          {options.map((option, index) => (
            <button
              id={`${id}-option-${index}`}
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === current}
              tabIndex={-1}
              data-option-index={index}
              data-active={active === index}
              onPointerMove={() => setActive(index)}
              onClick={() => choose(index)}
              className="filter-option"
            >
              <span>{option.label}</span><span aria-hidden="true">{option.value === current ? "✓" : ""}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
