"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { FileText, Search } from "lucide-react";
import type { SearchEntry } from "@/lib/site-types";
import { searchIndex } from "@/lib/search-engine";

/** Similarity 0–1 of two slugs (1 − edit distance / longer length). */
function similarity(a: string, b: string) {
  if (!a || !b) return 0;
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return 1 - rows[a.length][b.length] / Math.max(a.length, b.length);
}

/** Pages that look like what the missing address meant: its words through the search engine, then close slugs. */
function guess(index: SearchEntry[], pathname: string) {
  let path = pathname;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    /* keep it as typed */
  }
  const slug = path.replace(/^\/+|\/+$/g, "").replace(/^docs\/?/, "");
  if (!slug || path.startsWith("/admin") || path.startsWith("/api")) return [];
  const words = slug.split(/[\/\-_.]+/).filter((word) => word.length > 1).join(" ");
  const found = new Map<string, SearchEntry>();
  for (const result of searchIndex(index, words, 8).results) {
    const entry = index.find((e) => e.href === result.href);
    if (entry && result.kind === "page") found.set(entry.href, entry);
  }
  // A mistyped last segment ("instalsi" for "instalasi"): compare slugs directly.
  const last = slug.split("/").pop() ?? slug;
  const close = index
    .map((entry) => ({ entry, score: Math.max(similarity(slug, entry.href.replace(/^\/docs\//, "")), similarity(last, entry.href.split("/").pop() ?? "")) }))
    .filter((item) => item.score >= 0.6)
    .sort((a, b) => b.score - a.score);
  for (const { entry } of close) found.set(entry.href, entry);
  // Close slugs first: they are the likelier typo.
  const ordered = [...close.map((item) => item.entry), ...found.values()];
  return [...new Map(ordered.map((entry) => [entry.href, entry])).values()].slice(0, 5);
}

const noop = () => () => {};

/**
 * The 404 page's help: "Mungkin yang Anda cari" from the address that was typed
 * (read in the browser, so the not-found page stays static), and a search over
 * the public pages.
 */
export function SimilarPages({ index }: { index: SearchEntry[] }) {
  const pathname = useSyncExternalStore(noop, () => window.location.pathname, () => "");
  const [query, setQuery] = useState("");
  const suggestions = pathname ? guess(index, pathname) : [];
  const results = query.trim() ? searchIndex(index, query, 6).results.filter((result) => result.kind === "page") : [];
  if (!index.length) return null;
  return (
    <div className="mt-10 w-full text-left">
      {suggestions.length > 0 && !query.trim() && (
        <section data-testid="similar-pages">
          <h2 className="mb-2 text-xs font-medium tracking-wide text-fg-subtle uppercase">Mungkin yang Anda cari</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {suggestions.map((entry) => (
              <li key={entry.href}>
                <Link href={entry.href} className="flex items-start gap-3 px-4 py-3 hover:bg-fill/50">
                  <FileText className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-fg">{entry.title}</span>
                    <span className="block truncate text-xs text-fg-subtle">{entry.description || `${entry.tab} · ${entry.section}`}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <form role="search" onSubmit={(e) => e.preventDefault()} className="relative mt-6">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-fg-subtle" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari di dokumentasi…"
          aria-label="Cari di dokumentasi"
          className="h-11 w-full rounded-full border border-line bg-surface pr-4 pl-10 text-sm text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
      </form>
      {query.trim() && (
        <ul className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface" data-testid="not-found-results">
          {results.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-fg-subtle">Tidak ada hasil untuk “{query}”.</li>
          ) : (
            results.map((result) => (
              <li key={result.href}>
                <Link href={result.href} className="block px-4 py-3 text-sm text-fg hover:bg-fill/50">
                  {result.title}
                  <span className="block truncate text-xs text-fg-subtle">{result.context}</span>
                </Link>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
