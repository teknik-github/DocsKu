"use client";

import { useEffect } from "react";

/**
 * Inside the home builder's preview frame: clicking a section selects it in the
 * builder (links and buttons don't navigate), and the builder can scroll to and
 * outline a section. Messages are only exchanged with this site's own window.
 */
export function PreviewBridge() {
  useEffect(() => {
    if (window.parent === window) return;
    const origin = window.location.origin;
    const sectionOf = (target: EventTarget | null) => (target instanceof Element ? target.closest<HTMLElement>("[data-home-section]") : null);

    function mark(id: string | null, scroll: boolean) {
      document.querySelectorAll(".docsku-selected").forEach((el) => el.classList.remove("docsku-selected"));
      if (!id) return;
      const el = document.querySelector<HTMLElement>(`[data-home-section="${CSS.escape(id)}"]`);
      if (!el) return;
      el.classList.add("docsku-selected");
      if (scroll) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }

    function onClick(event: MouseEvent) {
      // A preview, not the site: nothing navigates, a click picks the section.
      event.preventDefault();
      event.stopPropagation();
      const section = sectionOf(event.target);
      if (!section) return;
      mark(section.dataset.homeSection!, false);
      window.parent.postMessage({ type: "docsku:select", id: section.dataset.homeSection }, origin);
    }

    function onMessage(event: MessageEvent) {
      if (event.origin !== origin || event.source !== window.parent) return;
      if (event.data?.type === "docsku:select") mark(event.data.id ?? null, true);
    }

    const style = document.createElement("style");
    style.textContent = `
      [data-home-section] { cursor: pointer; transition: outline-color .15s; outline: 2px solid transparent; outline-offset: -2px; }
      [data-home-section]:hover { outline-color: color-mix(in srgb, var(--accent) 45%, transparent); }
      [data-home-section].docsku-selected { outline-color: var(--accent); }
      nextjs-portal { display: none; }`;
    document.head.append(style);
    document.addEventListener("click", onClick, true);
    window.addEventListener("message", onMessage);
    window.parent.postMessage({ type: "docsku:ready" }, origin);
    return () => {
      style.remove();
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("message", onMessage);
    };
  }, []);
  return null;
}
