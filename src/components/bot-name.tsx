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
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const updatePos = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 32);
    const height = tooltipRef.current?.getBoundingClientRect().height ?? 220;
    const below = rect.bottom + 8;
    setPos({
      top: below + height <= window.innerHeight - 16 ? below : Math.max(16, rect.top - height - 8),
      left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)),
    });
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
    updatePos();
    function handleOutside(event: MouseEvent | TouchEvent) {
      if (triggerRef.current && !triggerRef.current.contains(event.target as Node)) {
        setShow(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", closeTooltip, true);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", closeTooltip, true);
    };
  }, [show, updatePos, closeTooltip]);

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
          ref={tooltipRef}
          className="pointer-events-none fixed z-[9999] w-80 max-w-[calc(100vw-32px)] rounded-xl border border-neutral-700/80 bg-neutral-900 p-4 shadow-xl"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-sm font-semibold text-white">{name}</span>
            <span className={`text-xs font-medium ${legend.groupColor}`}>{legend.groupLabel}</span>
          </div>
          <p className="mb-2 text-xs leading-relaxed text-neutral-400">{legend.groupDescription} &middot; {legend.subLabel}</p>
          <p className="text-[13px] leading-relaxed text-neutral-300">{legend.what}</p>
          <div className="mt-2 border-t border-neutral-800 pt-1.5">
            <p className="text-xs leading-relaxed text-neutral-400">{legend.impact}</p>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
