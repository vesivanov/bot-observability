"use client";

import { type ReactNode, useRef, useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { getBotLegend } from "@/lib/bot-legend";

export function BotName({
  name,
  href,
  className = "font-medium text-neutral-100 hover:text-white",
  children,
}: {
  name: string;
  href?: string;
  className?: string;
  children?: ReactNode;
}) {
  const legend = getBotLegend(name);
  const inner = children ?? name;
  const triggerRef = useRef<HTMLAnchorElement | HTMLSpanElement>(null);
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const updatePos = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: rect.left });
  }, []);

  const openTooltip = useCallback(() => {
    updatePos();
    setShow(true);
  }, [updatePos]);

  const closeTooltip = useCallback(() => setShow(false), []);

  // `suppressNextClick` is decided on pointerdown, *before* `click` fires —
  // browsers focus an anchor as part of the same tap gesture, ahead of the
  // click event, so branching the click handler on the (possibly
  // focus-just-set) `show` state would misfire: a first tap could open the
  // tooltip via onFocus and then immediately navigate away on the very same
  // tap's click, before the user has a chance to read it.
  const suppressNextClickRef = useRef(false);

  const armSuppression = useCallback(() => {
    if (!show) suppressNextClickRef.current = true;
  }, [show]);

  // Dismiss on a tap/click outside the trigger while the tooltip is open —
  // the only way touch users can close it, since there's no hover-out.
  useEffect(() => {
    if (!show) return;
    function handleOutside(event: MouseEvent | TouchEvent) {
      if (triggerRef.current && !triggerRef.current.contains(event.target as Node)) {
        setShow(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [show]);

  if (!legend) {
    return href ? (
      <Link className={className} href={href}>{inner}</Link>
    ) : (
      <span className={className}>{inner}</span>
    );
  }

  // Tap-to-toggle: on a linked trigger, the first tap opens the legend
  // instead of navigating (hover has no equivalent on touch); a second tap
  // (tooltip already open) falls through to the link's default navigation.
  // A non-linked trigger just toggles open/closed on each tap.
  const handleClick = (event: React.MouseEvent) => {
    if (href) {
      if (suppressNextClickRef.current) {
        suppressNextClickRef.current = false;
        event.preventDefault();
        openTooltip();
        return;
      }
      if (show) closeTooltip();
      return;
    }
    event.preventDefault();
    if (show) closeTooltip();
    else openTooltip();
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      closeTooltip();
      return;
    }
    if (!href && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      if (show) closeTooltip();
      else openTooltip();
    }
  };

  const trigger = href ? (
    <Link
      ref={triggerRef as React.RefObject<HTMLAnchorElement>}
      className={className}
      href={href}
      onMouseEnter={openTooltip}
      onMouseLeave={closeTooltip}
      onFocus={openTooltip}
      onBlur={closeTooltip}
      onMouseDown={armSuppression}
      onTouchStart={armSuppression}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {inner}
    </Link>
  ) : (
    <span
      ref={triggerRef as React.RefObject<HTMLSpanElement>}
      className={className}
      role="button"
      tabIndex={0}
      onMouseEnter={openTooltip}
      onMouseLeave={closeTooltip}
      onFocus={openTooltip}
      onBlur={closeTooltip}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {inner}
    </span>
  );

  return (
    <>
      {trigger}
      {show && typeof document !== "undefined" && createPortal(
        <div
          className="pointer-events-none fixed z-[9999] w-72 rounded-lg border border-neutral-700/80 bg-neutral-900 p-3 shadow-xl"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-sm font-semibold text-white">{name}</span>
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${legend.groupColor}`}>{legend.groupLabel}</span>
          </div>
          <p className="mb-1 text-[11px] text-neutral-400">{legend.groupDescription} &middot; {legend.subLabel}</p>
          <p className="text-[11px] leading-relaxed text-neutral-300">{legend.what}</p>
          <div className="mt-2 border-t border-neutral-800 pt-1.5">
            <p className="text-[10px] leading-relaxed text-neutral-500">{legend.impact}</p>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
