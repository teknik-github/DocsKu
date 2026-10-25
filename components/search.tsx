"use client";

import { createContext, use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, FileText, Hash, Search } from "lucide-react";
import type { SearchEntry } from "@/lib/site-types";
import { beacon } from "@/components/reader-footer";

type Result = {
  href: string;
  title: string;
  context: string;
  kind: "page" | "heading";
};

const SearchContext = createContext<() => void>(() => {});

type PendingQuery = { query: string; found: boolean } | null;

/** Reports a finished query once per dialog, so the dashboard can list searches that found nothing. */
function reportQuery(pending: { current: PendingQuery }, reported: Set<string>) {
  const item = pending.current;
  pending.current = null;
  const query = item?.query.toLowerCase().replace(/\s+/g, " ").trim() ?? "";
  if (!item || query.length < 2 || query.length > 100 || reported.has(query)) return;
  reported.add(query);
  beacon("/api/track", { type: "search", query, found: item.found });
}

function search(index: SearchEntry[], query: string): Result[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    return index.map((entry) => ({
      href: entry.href,
      title: entry.title,
      context: `${entry.tab} · ${entry.section}`,
      kind: "page",
    }));
  }
  const matches = (text: string) => terms.every((term) => text.toLowerCase().includes(term));
  const scored: (Result & { score: number })[] = [];
  for (const entry of index) {
    if (matches(`${entry.title} ${entry.section} ${entry.description}`)) {
      scored.push({
        href: entry.href,
        title: entry.title,
        context: entry.description || `${entry.tab} · ${entry.section}`,
        kind: "page",
        score: matches(entry.title) ? 3 : 2,
      });
    }
    for (const heading of entry.headings) {
      if (matches(heading.text)) {
        scored.push({
          href: `${entry.href}#${heading.id}`,
          title: heading.text,
          context: entry.title,
          kind: "heading",
          score: 1,
        });
      }
    }
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, 20);
}

export function SearchProvider({
  index,
  children,
}: {
  index: SearchEntry[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <SearchContext value={() => setOpen(true)}>
      {children}
      {open && <SearchDialog index={index} onClose={() => setOpen(false)} />}
    </SearchContext>
  );
}

function SearchDialog({ index, onClose }: { index: SearchEntry[]; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const results = search(index, query);
  const pending = useRef<PendingQuery>(null);
  const reported = useRef(new Set<string>());

  // A query counts once typing pauses for 1.5 s, or when the dialog closes.
  useEffect(() => {
    pending.current = query.trim() ? { query, found: search(index, query).length > 0 } : null;
    const timer = setTimeout(() => reportQuery(pending, reported.current), 1500);
    return () => clearTimeout(timer);
  }, [index, query]);
  useEffect(() => {
    const seen = reported.current;
    return () => reportQuery(pending, seen);
  }, []);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function go(result: Result | undefined) {
    if (!result) return;
    onClose();
    router.push(result.href);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(results[active]);
    } else if (event.key === "Escape") {
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[12vh] backdrop-blur-[2px]"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Cari dokumentasi"
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="size-4 shrink-0 text-fg-subtle" />
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Cari dokumentasi…"
            className="h-12 w-full bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
          />
          <kbd className="rounded border border-line px-1.5 py-0.5 font-sans text-[11px] text-fg-subtle">
            Esc
          </kbd>
        </div>
        <ul ref={listRef} className="max-h-[60vh] overflow-y-auto p-2">
          {results.length === 0 && (
            <li className="px-3 py-8 text-center text-sm text-fg-subtle">
              Tidak ada hasil untuk “{query}”.
            </li>
          )}
          {results.map((result, i) => (
            <li key={result.href}>
              <button
                type="button"
                data-index={i}
                onMouseMove={() => setActive(i)}
                onClick={() => go(result)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left ${
                  i === active ? "bg-fill" : ""
                }`}
              >
                {result.kind === "page" ? (
                  <FileText className="size-4 shrink-0 text-fg-subtle" />
                ) : (
                  <Hash className="size-4 shrink-0 text-fg-subtle" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-fg">{result.title}</span>
                  <span className="block truncate text-xs text-fg-subtle">{result.context}</span>
                </span>
                {i === active && <CornerDownLeft className="size-3.5 shrink-0 text-fg-subtle" />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function SearchField({ className = "" }: { className?: string }) {
  const openSearch = use(SearchContext);
  return (
    <button
      type="button"
      onClick={openSearch}
      className={`flex h-9 w-full items-center gap-2 rounded-lg border border-line bg-surface/60 px-3 text-sm text-fg-subtle transition-colors hover:border-line-strong ${className}`}
    >
      <Search className="size-4" />
      <span className="flex-1 text-left">Cari</span>
      <kbd className="flex items-center gap-0.5 font-sans text-[11px]">
        <span className="rounded border border-line px-1">Ctrl</span>
        <span className="rounded border border-line px-1">K</span>
      </kbd>
    </button>
  );
}

export function SearchIconButton() {
  const openSearch = use(SearchContext);
  return (
    <button
      type="button"
      onClick={openSearch}
      aria-label="Cari"
      className="inline-flex size-8 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-fill hover:text-fg"
    >
      <Search className="size-4" />
    </button>
  );
}
