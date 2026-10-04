"use client";

import { type ReactNode, useRef, useState, useId, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { getBotLegend } from "@/lib/bot-legend";

export function BotName({ name, href, className = "font-medium text-neutral-100 hover:text-white", children }: {
  name: string; href?: string; className?: string; children?: ReactNode;
}) {
  const legend = getBotLegend(name);
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{top: number; left: number} | null>(null);
  useEffect(() => {
    if (!position) return;
    const close = () => setPosition(null);
    const outside = (event: PointerEvent) => {
      if (!trigger.current?.contains(event.target as Node) && !tooltip.current?.contains(event.target as Node)) close();
    };
    const keyboard = (event: KeyboardEvent) => { if (event.key === "Escape") { close(); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", keyboard);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", keyboard);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [position]);
  // Non-linked names can appear inside a parent link (rankings and movers).
  if (!href) return <span className={className} title={legend?.what}>{children ?? name}</span>;
  return <span className="bot-identity">
    <Link className={className} href={href}>{children ?? name}</Link>
    {legend && <button ref={trigger} type="button" className="bot-info-button" aria-label={`About ${name}`} aria-expanded={!!position} aria-controls={position ? id : undefined} onClick={() => {
      if (position) { setPosition(null); return; }
      const rect = trigger.current!.getBoundingClientRect();
      setPosition({ top: Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - 280)), left: Math.max(16, Math.min(rect.left, window.innerWidth - 336)) });
    }}>ⓘ</button>}
    {position && legend && createPortal(<div id={id} ref={tooltip} role="note" className="bot-info-popover" style={position}>
      <strong>{name}</strong><span className={legend.groupColor}>{legend.groupLabel}</span>
      <p>{legend.what}</p><p>{legend.impact}</p>
    </div>, document.body)}
  </span>;
}
