"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, FileText, Hash, Search, Sparkles } from "lucide-react";
import type { SearchEntry } from "@/lib/site-types";
import { search } from "@/components/search";
import { beacon } from "@/components/reader-footer";
import { QUERY_EVENT, widgetHref } from "@/components/widget/frame";

// The Markdown renderer loads only when someone asks.
const AskAnswer = dynamic(() => import("@/components/ask-ai"), { ssr: false });
const MIN_QUESTION = 3;

/**
 * The widget's start: greeting, search over the public docs (the same index
 * and matching as the site's search box), "Tanya AI", and popular articles.
 * The query is kept in the URL (?q=), so "back" from an article keeps it.
 */
export function WidgetHome({
  index,
  ai,
  greeting,
  popular,
}: {
  index: SearchEntry[];
  ai: boolean;
  greeting: string;
  popular: { href: string; title: string; section: string }[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [asking, setAsking] = useState<string | null>(null);
  const reported = useRef(new Set<string>());
  /** The query this screen shows, as kept in the URL. */
  const shown = useRef("");

  useEffect(() => {
    // The screen can come back from the router's cache with its old state. Same query in the
    // URL ("back" from an article): keep it, including an open AI answer. A new one (the host
    // page opened the widget with a search): start over with it.
    const fromUrl = (new URLSearchParams(window.location.search).get("q") ?? "").slice(0, 200);
    if (fromUrl.trim() !== shown.current) {
      shown.current = fromUrl.trim();
      setAsking(null);
      setQuery(fromUrl);
    }
    const onQuery = (event: Event) => {
      setAsking(null);
      change((event as CustomEvent<string>).detail);
    };
    window.addEventListener(QUERY_EVENT, onQuery);
    return () => window.removeEventListener(QUERY_EVENT, onQuery);
  }, []);

  const trimmed = query.trim();
  const results = trimmed ? search(index, trimmed) : [];

  /** New text in the box; kept in the address (?q=) so "back" from an article returns to it. */
  function change(value: string) {
    const next = value.slice(0, 200);
    setQuery(next);
    const kept = next.trim();
    shown.current = kept;
    window.history.replaceState(window.history.state, "", kept ? `/widget?q=${encodeURIComponent(kept)}` : "/widget");
  }

  // Report the query once it has settled (like the site's search box).
  useEffect(() => {
    const normalised = trimmed.toLowerCase().replace(/\s+/g, " ");
    if (normalised.length < 2 || normalised.length > 100 || reported.current.has(normalised)) return;
    const timer = setTimeout(() => {
      reported.current.add(normalised);
      beacon("/api/track", { type: "search", query: normalised, found: search(index, normalised).length > 0 });
    }, 1500);
    return () => clearTimeout(timer);
  }, [trimmed, index]);

  if (asking) {
    return <AskAnswer question={asking} onBack={() => setAsking(null)} onNavigate={(href) => router.push(widgetHref(href))} />;
  }

  const canAsk = ai && trimmed.length >= MIN_QUESTION;

  return (
    <div className="space-y-5 px-4 py-5">
      <div>
        <p className="text-base font-semibold text-fg">{greeting}</p>
        <p className="mt-0.5 text-xs text-fg-subtle">Cari di dokumentasi{ai ? " atau tanyakan langsung ke AI" : ""}.</p>
      </div>

      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          if (canAsk && results.length === 0) setAsking(trimmed);
          else if (results[0]) router.push(widgetHref(results[0].href));
        }}
        className="relative"
      >
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle" />
        <input
          id="widget-search"
          type="search"
          value={query}
          onChange={(event) => change(event.target.value)}
          placeholder="Cari artikel atau ketik pertanyaan…"
          aria-label="Cari bantuan"
          className="h-11 w-full rounded-xl border border-line bg-surface pr-3 pl-9 text-sm text-fg outline-none placeholder:text-fg-subtle focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
      </form>

      {canAsk && (
        <button
          type="button"
          onClick={() => setAsking(trimmed)}
          className="flex w-full items-center gap-3 rounded-xl border border-accent/30 bg-accent-soft/50 px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent-soft"
        >
          <Sparkles className="size-4 shrink-0 text-accent" />
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-fg">Tanya AI</span>
            <span className="block truncate text-xs text-fg-muted">&ldquo;{trimmed}&rdquo;</span>
          </span>
          <ChevronRight className="size-4 text-fg-subtle" />
        </button>
      )}

      {trimmed ? (
        results.length ? (
          <ul aria-label="Hasil pencarian" className="space-y-1">
            {results.map((result) => (
              <li key={result.href}>
                <Link href={widgetHref(result.href)} className="flex items-start gap-2.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-fill">
                  {result.kind === "page" ? <FileText className="mt-0.5 size-4 shrink-0 text-fg-subtle" /> : <Hash className="mt-0.5 size-4 shrink-0 text-fg-subtle" />}
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-fg">{result.title}</span>
                    <span className="block truncate text-xs text-fg-subtle">{result.context}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg bg-fill px-3 py-2.5 text-sm text-fg-muted">
            Tidak ada artikel untuk &ldquo;{trimmed}&rdquo;.{canAsk ? " Coba Tanya AI di atas." : " Coba kata lain."}
          </p>
        )
      ) : (
        popular.length > 0 && (
          <section>
            <h2 className="mb-1.5 text-xs font-medium text-fg-subtle">Artikel populer</h2>
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
              {popular.map((page) => (
                <li key={page.href}>
                  <Link href={widgetHref(page.href)} className="flex items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-fill/60">
                    <FileText className="size-4 shrink-0 text-fg-subtle" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-fg">{page.title}</span>
                      <span className="block truncate text-xs text-fg-subtle">{page.section}</span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-fg-subtle" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )
      )}
    </div>
  );
}
