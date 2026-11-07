"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, FileText, Sparkles } from "lucide-react";
import { readNdjson, renderChatMarkdown } from "@/components/admin/editor/ai-client";

type Source = { href: string; title: string; section: string };
type AskEvent = { t: "sources"; v: Source[] } | { t: "text"; v: string } | { t: "miss" } | { t: "error"; v: string };
type State = { status: "loading" | "streaming" | "done" | "miss" | "error"; text: string; sources: Source[]; error?: string };

/**
 * The "Tanya AI" answer inside the search box: streams /api/ask and shows the
 * answer (Markdown, raw HTML escaped) with links to the articles it came from.
 * Loaded only when a visitor asks, so the Markdown renderer stays out of the page bundle.
 */
export default function AskAnswer({ question, onBack, onNavigate }: { question: string; onBack: () => void; onNavigate: (href: string) => void }) {
  const [state, setState] = useState<State>({ status: "loading", text: "", sources: [] });

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ question }),
          signal: controller.signal,
        });
        await readNdjson<AskEvent>(res, (event) =>
          setState((s) =>
            event.t === "sources" ? { ...s, sources: event.v }
            : event.t === "text" ? { ...s, status: "streaming", text: s.text + event.v }
            : event.t === "miss" ? { ...s, status: "miss" }
            : { ...s, status: "error", error: event.v },
          ),
        );
        setState((s) => (s.status === "loading" || s.status === "streaming" ? { ...s, status: "done" } : s));
      } catch (error) {
        if (!controller.signal.aborted) setState((s) => ({ ...s, status: "error", error: (error as Error).message }));
      }
    })();
    return () => controller.abort();
  }, [question]);

  // Links in the answer go through the router and close the search box.
  function onClick(event: React.MouseEvent) {
    const link = (event.target as HTMLElement).closest("a");
    const href = link?.getAttribute("href");
    if (!href || !href.startsWith("/") || event.metaKey || event.ctrlKey) return;
    event.preventDefault();
    onNavigate(href);
  }

  const { status, text, sources } = state;
  const working = status === "loading" || status === "streaming";

  return (
    <div className="max-h-[60vh] overflow-y-auto">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg">
          <ArrowLeft className="size-3.5" />
          Hasil pencarian
        </button>
        <span className="flex items-center gap-1.5 text-xs font-medium text-accent">
          <Sparkles className={`size-3.5 ${working ? "animate-pulse" : ""}`} />
          Tanya AI
        </span>
      </div>

      <div className="px-5 py-4">
        <p className="text-sm font-medium text-fg">{question}</p>

        {status === "loading" && (
          <div className="mt-4 space-y-2" aria-live="polite">
            <p className="text-sm text-fg-subtle">Mencari jawaban di dokumentasi…</p>
            <div className="h-3 w-11/12 animate-pulse rounded bg-fill" />
            <div className="h-3 w-4/5 animate-pulse rounded bg-fill" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-fill" />
          </div>
        )}

        {text && status !== "miss" && (
          <div
            className="chat-prose mt-3 text-sm leading-relaxed text-fg"
            onClick={onClick}
            aria-live="polite"
            dangerouslySetInnerHTML={{ __html: renderChatMarkdown(text) }}
          />
        )}

        {status === "miss" && (
          <p className="mt-3 rounded-lg bg-fill px-3 py-2.5 text-sm text-fg-muted">
            Dokumentasi belum membahas pertanyaan ini. Coba kata lain, atau buka artikel yang mungkin terkait di bawah.
          </p>
        )}

        {status === "error" && <p className="mt-3 rounded-lg bg-fill px-3 py-2.5 text-sm text-fg-muted">{state.error}</p>}

        {sources.length > 0 && status !== "loading" && (
          <div className="mt-5">
            <p className="mb-1.5 text-xs font-medium text-fg-subtle">{status === "miss" ? "Mungkin terkait" : "Sumber"}</p>
            <ul className="space-y-1">
              {sources.map((source) => (
                <li key={source.href}>
                  <a
                    href={source.href}
                    onClick={onClick}
                    className="flex items-center gap-2.5 rounded-lg border border-line px-3 py-2 text-sm transition-colors hover:border-line-strong hover:bg-fill"
                  >
                    <FileText className="size-4 shrink-0 text-fg-subtle" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-fg">{source.title}</span>
                      <span className="block truncate text-xs text-fg-subtle">{source.section}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {(status === "done" || status === "streaming") && (
          <p className="mt-4 text-[11px] text-fg-subtle">Jawaban dibuat AI dari isi dokumentasi dan bisa keliru. Periksa artikel sumbernya.</p>
        )}
      </div>
    </div>
  );
}
