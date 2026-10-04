"use client";

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

const subscribe = () => () => {};
const getHeader = () => document.getElementById("header-actions");
const noHeader = () => null;

export function ConnectionButton({ children, receipt }: { children: ReactNode; receipt: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const menu = useRef<HTMLDetailsElement>(null);
  const menuTrigger = useRef<HTMLElement>(null);
  const fromMenu = useRef(false);
  const header = useSyncExternalStore(subscribe, getHeader, noHeader);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (menu.current && !menu.current.contains(event.target as Node)) menu.current.open = false;
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);
  function open(inMenu: boolean) {
    fromMenu.current = inMenu;
    if (menu.current) menu.current.open = false;
    dialog.current?.showModal();
  }
  return <>
    {header && createPortal(<details ref={menu} className="dashboard-settings" onKeyDown={event => {
      if (event.key === "Escape" && menu.current) { menu.current.open = false; menuTrigger.current?.focus(); }
    }}>
      <summary ref={menuTrigger}>Settings <span aria-hidden="true">⌄</span></summary>
      <div className="settings-popover">
        <button type="button" onClick={() => open(true)}>Website connection <span aria-hidden="true">↗</span></button>
        <form action="/logout" method="POST"><button type="submit">Sign out</button></form>
      </div>
    </details>, header)}
    <button className="receipt-link" type="button" onClick={() => open(false)} aria-label={`${receipt}. Open website connection`}>{receipt} <span aria-hidden="true">↗</span></button>
    <dialog ref={dialog} className="connection-dialog" aria-labelledby="connection-title"
      onClose={() => { if (fromMenu.current) menuTrigger.current?.focus(); }}
      onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className="connection-dialog-header"><h2 id="connection-title">Website connection</h2><button type="button" className="quiet-button" onClick={() => dialog.current?.close()} aria-label="Close website connection">Close ×</button></div>
      <div className="connection-dialog-body">{children}</div>
    </dialog>
  </>;
}
