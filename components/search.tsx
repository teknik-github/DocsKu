"use client";

import { createContext, use, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { CornerDownLeft, FileText, Hash, Search, Sparkles } from "lucide-react";
import type { SearchEntry } from "@/lib/site-types";
import { searchIndex, type SearchResult } from "@/lib/search-engine";
import { beacon } from "@/components/reader-footer";
import { useSite } from "@/components/site-context";
import { t } from "@/lib/i18n";

export type Result = SearchResult;

const SearchContext = createContext<() => void>(() => {});

// Loaded when a visitor asks, so the Markdown renderer stays out of every page's bundle.
const AskAnswer = dynamic(() => import("@/components/ask-ai"), { ssr: false });
const MIN_QUESTION = 3;

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

/** Results for a query (see lib/search-engine.ts: prefixes, synonyms, typos). Used by the widget too. */
export function search(index: SearchEntry[], query: string): Result[] {
  return searchIndex(index, query).results;
}

/** Records which article a search led to (the dashboard's "Dari pencarian ke artikel"). */
function reportClick(query: string, href: string) {
  const q = query.toLowerCase().replace(/\s+/g, " ").trim();
  const slug = href.replace(/^\/docs\//, "").replace(/#.*$/, "");
  if (q.length < 2 || q.length > 100 || !slug || slug === href) return;
  beacon("/api/track", { type: "search_click", query: q, slug });
}

export function SearchProvider({
  index,
  indexes,
  ai = false,
  children,
}: {
  index: SearchEntry[];
  /** Entries per extra language; the path picks one (/docs/<code>/…). */
  indexes?: Record<string, SearchEntry[]>;
  /** Offer "Tanya AI" (an answer from the docs) above the results. */
  ai?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { locale } = useSite();
  const localeIndex = indexes?.[locale] ?? index;

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
      {open && <SearchDialog index={localeIndex} ai={ai} locale={locale} onClose={() => setOpen(false)} />}
    </SearchContext>
  );
}

function SearchDialog({ index, ai, locale, onClose }: { index: SearchEntry[]; ai: boolean; locale: string; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  /** The question being answered by AI, shown instead of the results. */
  const [asked, setAsked] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  /** Category (navigation section) the results are narrowed to; null = all. */
  const [category, setCategory] = useState<string | null>(null);
  const outcome = searchIndex(index, query);
  // Sections among the results, in result order, for the filter chips.
  const sections = query.trim() ? [...new Set(outcome.results.map((result) => result.section).filter(Boolean))] : [];
  const results = category && sections.includes(category) ? outcome.results.filter((result) => result.section === category) : outcome.results;
  const canAsk = ai && query.trim().length >= MIN_QUESTION;
  // With "Tanya AI" on, it is row 0 and the results follow.
  const offset = canAsk ? 1 : 0;
  const rows = results.length + offset;
  const pending = useRef<PendingQuery>(null);
  const reported = useRef(new Set<string>());

  // A query counts once typing pauses for 1.5 s, or when the dialog closes.
  useEffect(() => {
    pending.current = query.trim() ? { query, found: searchIndex(index, query).results.length > 0 } : null;
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
    if (query.trim()) reportClick(query, result.href);
    onClose();
    router.push(result.href);
  }

  function navigate(href: string) {
    onClose();
    router.push(href);
  }

  function choose(i: number) {
    if (canAsk && i === 0) setAsked(query.trim());
    else go(results[i - offset]);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      onClose();
    } else if (asked !== null) {
      if (event.key === "Enter" && query.trim() !== asked && query.trim().length >= MIN_QUESTION) {
        event.preventDefault();
        setAsked(query.trim());
      }
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, rows - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(active);
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
        aria-label={t(locale, "searchLabel")}
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
              setAsked(null);
              setCategory(null);
            }}
            onKeyDown={onKeyDown}
            placeholder={t(locale, ai ? "searchOrAsk" : "searchDocs")}
            className="h-12 w-full bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
          />
          <kbd className="rounded border border-line px-1.5 py-0.5 font-sans text-[11px] text-fg-subtle">
            Esc
          </kbd>
        </div>
        {asked !== null ? (
          <AskAnswer key={asked} question={asked} locale={locale} onBack={() => setAsked(null)} onNavigate={navigate} />
        ) : (
        <>
        {sections.length > 1 && (
          <div role="group" aria-label={t(locale, "allCategories")} className="flex gap-1.5 overflow-x-auto border-b border-line px-3 py-2" data-testid="search-categories">
            {[null, ...sections].map((section) => (
              <button
                key={section ?? "_all"}
                type="button"
                aria-pressed={category === section}
                onClick={() => {
                  setCategory(section);
                  setActive(0);
                }}
                className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                  category === section ? "border-accent bg-accent-soft text-accent" : "border-line text-fg-muted hover:text-fg"
                }`}
              >
                {section ?? t(locale, "allCategories")}
              </button>
            ))}
          </div>
        )}
        {outcome.suggestion && (
          <button
            type="button"
            data-testid="search-suggestion"
            onClick={() => {
              setQuery(outcome.suggestion ?? "");
              setActive(0);
              setCategory(null);
            }}
            className="block w-full border-b border-line px-4 py-2 text-left text-xs text-fg-muted hover:text-fg"
          >
            {t(locale, "didYouMean", { q: outcome.suggestion })}
          </button>
        )}
        <ul ref={listRef} className="max-h-[60vh] overflow-y-auto p-2">
          {canAsk && (
            <li>
              <button
                type="button"
                data-index={0}
                onMouseMove={() => setActive(0)}
                onClick={() => choose(0)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left ${active === 0 ? "bg-fill" : ""}`}
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
                  <Sparkles className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-fg">
                    {t(locale, "askAi")}: <span className="font-medium">“{query.trim()}”</span>
                  </span>
                  <span className="block truncate text-xs text-fg-subtle">{t(locale, "askAiHint")}</span>
                </span>
                {active === 0 && <CornerDownLeft className="size-3.5 shrink-0 text-fg-subtle" />}
              </button>
            </li>
          )}
          {results.length === 0 && (
            <li className="px-3 py-8 text-center text-sm text-fg-subtle">
              {canAsk ? t(locale, "askAiNoTitle") : t(locale, "noResults", { q: query })}
            </li>
          )}
          {results.map((result, j) => {
            const i = j + offset;
            return (
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
            );
          })}
        </ul>
        </>
        )}
      </div>
    </div>
  );
}

export function SearchField({ className = "", label }: { className?: string; label?: React.ReactNode }) {
  const openSearch = use(SearchContext);
  const { locale } = useSite();
  return (
    <button
      type="button"
      onClick={openSearch}
      className={`flex h-9 w-full items-center gap-2 rounded-lg border border-line bg-surface/60 px-3 text-sm text-fg-subtle transition-colors hover:border-line-strong ${className}`}
    >
      <Search className="size-4" />
      <span className="flex-1 truncate text-left">{label ?? t(locale, "search")}</span>
      <kbd className="flex items-center gap-0.5 font-sans text-[11px]">
        <span className="rounded border border-line px-1">Ctrl</span>
        <span className="rounded border border-line px-1">K</span>
      </kbd>
    </button>
  );
}

export function SearchIconButton() {
  const openSearch = use(SearchContext);
  const { locale } = useSite();
  return (
    <button
      type="button"
      onClick={openSearch}
      aria-label={t(locale, "search")}
      className="inline-flex size-8 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-fill hover:text-fg"
    >
      <Search className="size-4" />
    </button>
  );
}
