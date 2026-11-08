"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LifeBuoy, X } from "lucide-react";
import { originAllowed } from "@/lib/widget";

/** "/docs/a/b#c" → "/widget/a/a/b#c": articles open inside the widget. */
export function widgetHref(href: string) {
  return href.replace(/^\/docs\//, "/widget/a/");
}

/** Asks the embedding page (via /widget.js) to close the panel. */
function postToParent(origin: string | null, message: { type: string }) {
  if (origin && window.parent !== window) window.parent.postMessage(message, origin);
}

export const QUERY_EVENT = "docsku-widget-query";

/**
 * The frame around every /widget page: header with the close button, the
 * message channel with /widget.js on the host page, and link handling (docs
 * articles open in the widget, everything else in a new tab).
 *
 * Messages are only taken from the parent window at an allowed origin, and
 * only ever sent to that origin.
 */
export function WidgetFrame({
  siteName,
  allowedOrigins,
  accent,
  children,
}: {
  siteName: string;
  allowedOrigins: string[];
  accent: string | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const parentOrigin = useRef<string | null>(null);
  const [framed, setFramed] = useState(false);

  useEffect(() => {
    const isFramed = window.parent !== window;
    // Rendered on the server as unframed; the close button only makes sense inside a frame.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the window after mount
    setFramed(isFramed);
    function onMessage(event: MessageEvent) {
      if (event.source !== window.parent || !originAllowed(event.origin, allowedOrigins)) return;
      const data = event.data as { type?: string; query?: unknown } | null;
      if (data?.type === "docsku:init") {
        parentOrigin.current = event.origin;
        postToParent(event.origin, { type: "docsku:ready" });
      } else if (data?.type === "docsku:open" && event.origin === parentOrigin.current) {
        const query = typeof data.query === "string" ? data.query.slice(0, 200) : "";
        if (window.location.pathname !== "/widget") {
          router.push(query ? `/widget?q=${encodeURIComponent(query)}` : "/widget");
        } else {
          if (query) window.dispatchEvent(new CustomEvent(QUERY_EVENT, { detail: query }));
          document.getElementById("widget-search")?.focus();
        }
      }
    }
    window.addEventListener("message", onMessage);
    // The host's "load" handler may run before this listener exists, so say hello too.
    // The message carries nothing; the reply (docsku:init) is checked against the allowed origins.
    if (isFramed) window.parent.postMessage({ type: "docsku:hello" }, "*");
    return () => window.removeEventListener("message", onMessage);
  }, [allowedOrigins, router]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented) postToParent(parentOrigin.current, { type: "docsku:close" });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Docs links stay in the widget; anything else opens in a new tab, never inside the frame.
  function onClick(event: React.MouseEvent) {
    const link = (event.target as HTMLElement).closest("a");
    const href = link?.getAttribute("href");
    if (!link || !href || href.startsWith("#") || link.target === "_blank" || event.defaultPrevented) return;
    const url = new URL(href, window.location.href);
    if (url.origin === window.location.origin && url.pathname.startsWith("/widget")) return;
    event.preventDefault();
    if (url.origin === window.location.origin && url.pathname.startsWith("/docs/") && !event.metaKey && !event.ctrlKey) {
      router.push(widgetHref(url.pathname) + url.hash);
    } else {
      window.open(url.href, "_blank", "noopener,noreferrer");
    }
  }

  const style = accent ? ({ "--accent": accent, "--accent-strong": accent } as React.CSSProperties) : undefined;

  return (
    <div className="flex h-dvh flex-col bg-page text-fg" style={style}>
      <header className="flex shrink-0 items-center gap-2.5 border-b border-line bg-surface px-4 py-3">
        <span className="flex size-7 items-center justify-center rounded-lg bg-accent text-white">
          <LifeBuoy className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">Pusat bantuan</span>
          <span className="block truncate text-xs text-fg-subtle">{siteName}</span>
        </span>
        {framed && (
          <button
            type="button"
            onClick={() => postToParent(parentOrigin.current, { type: "docsku:close" })}
            aria-label="Tutup bantuan"
            className="rounded-lg p-1.5 text-fg-muted hover:bg-fill hover:text-fg"
          >
            <X className="size-4" />
          </button>
        )}
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto" onClick={onClick}>
        {children}
      </main>
    </div>
  );
}
