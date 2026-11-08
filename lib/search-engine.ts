import type { SearchEntry } from "@/lib/site-types";

/**
 * Client-side search over the public search index (titles, descriptions,
 * sections and headings). Pure and dependency-free, so the docs site and the
 * help widget share it.
 *
 * - Words are compared without case or accents, and a query word matches the
 *   start of a word ("inst" → "instalasi").
 * - Synonyms: "install" also finds "instalasi"/"pasang", Indonesian ↔ English
 *   (SYNONYMS below).
 * - Typos: a word of 4+ letters may be one edit off (two for 8+), so
 *   "instalsi" still finds "instalasi". Results found only that way come with
 *   `suggestion`, the query spelled as the index spells it ("Mungkin maksud Anda").
 */

export type SearchResult = {
  href: string;
  title: string;
  context: string;
  kind: "page" | "heading";
  /** Navigation section of the page (for the category filter). */
  section: string;
};

export type SearchOutcome = { results: SearchResult[]; suggestion: string | null };

/** Groups of single words that mean the same thing for searching (lower-case, accent-free, 3+ letters). */
const SYNONYMS: string[][] = [
  ["install", "instal", "instalasi", "pasang", "pemasangan", "setup"],
  ["konfigurasi", "config", "configuration", "pengaturan", "setting", "settings", "atur"],
  ["hapus", "delete", "remove", "menghapus"],
  ["login", "masuk", "signin"],
  ["logout", "keluar", "signout"],
  ["daftar", "register", "signup", "registrasi"],
  ["password", "sandi"],
  ["pengguna", "user", "users", "akun", "account"],
  ["perbarui", "update", "upgrade", "pembaruan"],
  ["error", "galat", "kesalahan", "gagal", "masalah", "troubleshoot", "troubleshooting"],
  ["mulai", "start", "memulai", "pengenalan", "intro", "quickstart"],
  ["unduh", "download"],
  ["unggah", "upload"],
  ["gambar", "image", "foto", "picture"],
  ["tautan", "link", "url"],
  ["cari", "search", "pencarian"],
  ["kontainer", "container", "docker"],
  ["server", "peladen"],
  ["database", "basisdata"],
  ["keamanan", "security", "aman"],
  ["tema", "theme", "tampilan"],
  ["navigasi", "navigation", "menu", "sidebar"],
  ["halaman", "page", "pages"],
  ["kode", "code"],
  ["contoh", "example", "sample"],
  ["harga", "price", "pricing", "biaya"],
];

const normalise = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ");

const words = (text: string) => normalise(text).split(/[\s-]+/).filter(Boolean);

const synonymsOf = (() => {
  const map = new Map<string, string[]>();
  for (const group of SYNONYMS) {
    const all = group.filter((term) => term.length >= 3 && !/[\s-]/.test(term));
    for (const term of all) map.set(term, [...new Set([...(map.get(term) ?? []), ...all.filter((other) => other !== term)])]);
  }
  return (term: string) => map.get(term) ?? [];
})();

/** Damerau-Levenshtein (optimal string alignment) distance, giving up above `max`. */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows: number[][] = [];
  for (let i = 0; i <= a.length; i++) rows.push([i]);
  for (let j = 1; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let best = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, rows[i - 2][j - 2] + 1);
      rows[i][j] = value;
      best = Math.min(best, value);
    }
    if (best > max) return max + 1;
  }
  return rows[a.length][b.length];
}

const allowedTypos = (term: string) => (term.length >= 8 ? 2 : term.length >= 4 ? 1 : 0);

type Match = { score: number; via?: string; distance?: number };

/** How a query word matches a set of words: 3 exact/prefix, 2 synonym, 1 typo (with the word it matched), 0 none. */
function matchTerm(term: string, tokens: string[]): Match {
  if (tokens.some((token) => token.startsWith(term))) return { score: 3 };
  const synonyms = synonymsOf(term);
  if (synonyms.some((synonym) => tokens.some((token) => token.startsWith(synonym)))) return { score: 2 };
  const max = allowedTypos(term);
  if (max === 0) return { score: 0 };
  let best: Match = { score: 0 };
  for (const token of tokens) {
    // The whole word first; its start too, so a typo in a prefix ("instl" ~ "instalasi") counts.
    const whole = distance(term, token, max);
    const start = token.length > term.length + max ? distance(term, token.slice(0, term.length), max) : max + 1;
    const d = Math.min(whole, start);
    if (d > max) continue;
    // Suggest the word itself when it is close; a long word matched by its start is a weaker suggestion.
    const rank = whole <= max ? whole : d + 0.5;
    if (best.distance === undefined || rank < best.distance || (rank === best.distance && token.length < (best.via?.length ?? Infinity))) {
      best = { score: 1, via: token, distance: rank };
    }
  }
  return best;
}

type Indexed = { entry: SearchEntry; title: string[]; body: string[]; headings: { text: string; id: string; tokens: string[] }[] };

const cache = new WeakMap<SearchEntry[], Indexed[]>();

function prepare(index: SearchEntry[]): Indexed[] {
  let prepared = cache.get(index);
  if (!prepared) {
    prepared = index.map((entry) => ({
      entry,
      title: words(entry.title),
      // A page also matches by its headings' words ("docker linux" → the Docker page with "Instalasi di Linux").
      body: words(`${entry.section} ${entry.tab} ${entry.description} ${entry.headings.map((heading) => heading.text).join(" ")}`),
      headings: entry.headings.map((heading) => ({ ...heading, tokens: words(heading.text) })),
    }));
    cache.set(index, prepared);
  }
  return prepared;
}

type Typos = Map<string, Match>;

/** Every query word must match; the weakest match decides how the result ranks. */
function matchAll(terms: string[], tokens: string[], typos: Typos): number {
  let weakest = 3;
  const found: [string, Match][] = [];
  for (const term of terms) {
    const match = matchTerm(term, tokens);
    if (match.score === 0) return 0;
    if (match.score === 1) found.push([term, match]);
    weakest = Math.min(weakest, match.score);
  }
  // Only spellings from results that matched every word feed "Mungkin maksud Anda"; the closest word wins.
  for (const [term, match] of found) {
    const known = typos.get(term);
    if (!known || (match.distance ?? 9) < (known.distance ?? 9) || ((match.distance ?? 9) === (known.distance ?? 9) && (match.via?.length ?? 99) < (known.via?.length ?? 99))) typos.set(term, match);
  }
  return weakest;
}

export function searchIndex(index: SearchEntry[], query: string, limit = 20): SearchOutcome {
  const terms = words(query);
  if (terms.length === 0) {
    return {
      results: index.map((entry) => ({ href: entry.href, title: entry.title, context: `${entry.tab} · ${entry.section}`, kind: "page", section: entry.section })),
      suggestion: null,
    };
  }
  const typos: Typos = new Map();
  const scored: (SearchResult & { score: number })[] = [];
  let exact = false;
  for (const item of prepare(index)) {
    const inTitle = matchAll(terms, item.title, typos);
    const inPage = inTitle ? inTitle : matchAll(terms, [...item.title, ...item.body], typos);
    if (inPage) {
      // Title matches rank above description/section matches; typos rank last.
      scored.push({
        href: item.entry.href,
        title: item.entry.title,
        context: item.entry.description || `${item.entry.tab} · ${item.entry.section}`,
        kind: "page",
        section: item.entry.section,
        score: inPage * 10 + (inTitle ? 5 : 0),
      });
      if (inPage > 1) exact = true;
    }
    for (const heading of item.headings) {
      const inHeading = matchAll(terms, heading.tokens, typos);
      if (!inHeading) continue;
      scored.push({
        href: `${item.entry.href}#${heading.id}`,
        title: heading.text,
        context: item.entry.title,
        kind: "heading",
        section: item.entry.section,
        score: inHeading * 10,
      });
      if (inHeading > 1) exact = true;
    }
  }
  const results = scored.sort((a, b) => b.score - a.score).slice(0, limit).map((item): SearchResult => ({ href: item.href, title: item.title, context: item.context, kind: item.kind, section: item.section }));
  // Offer the corrected spelling only when nothing matched without a typo.
  const suggestion = !exact && typos.size > 0 ? terms.map((term) => typos.get(term)?.via ?? term).join(" ") : null;
  return { results, suggestion: suggestion && suggestion !== terms.join(" ") ? suggestion : null };
}
