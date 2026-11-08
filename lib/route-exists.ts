import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Existence checks for proxy.ts, so a missing page answers with a real HTTP 404.
 *
 * With Cache Components and Partial Prefetching, a URL whose params weren't
 * prerendered gets the route's App Shell at once, and the status is then fixed
 * at 200 even when the page later calls notFound(). The proxy runs before that
 * and rewrites misses to an unmatched path.
 *
 * What exists is kept in memory (like the redirects map): every published doc
 * slug with its visibility, the extra language codes, and the usernames with
 * a public author page. It reloads after RELOAD_MS, or at once when
 * `forgetRouteExistence()` runs after a change (publish, unpublish, slug,
 * visibility, delete, languages, author settings). A miss is always checked
 * against the database before answering 404, so a page published a moment ago
 * (or on another instance) is never a 404; only removals rely on the reload.
 *
 * An internal article counts only for a valid session (checked per request,
 * never cached), so a visitor gets the same 404 for it as for a slug that
 * doesn't exist.
 */

const SESSION_COOKIE = "docsku_session";
const RELOAD_MS = 60_000;

type Snapshot = {
  /** Published doc pages: slug → visibility. */
  pages: Map<string, string>;
  languages: Set<string>;
  authors: Set<string>;
  /** Archived documentation versions: version slug → its page slugs. */
  archives: Map<string, Set<string>>;
  at: number;
};

// globalThis, so server actions and the proxy (separate bundles, one process) share it.
const store = globalThis as unknown as { docskuRouteExistence?: Promise<Snapshot> };

async function publishedPages(slug?: string) {
  const rows = await db.execute<{ slug: string; visibility: string }>(
    sql`select slug, visibility from pages where status = 'published' and kind = 'doc' ${slug === undefined ? sql`` : sql`and slug = ${slug}`}`,
  );
  return new Map(rows.map((row) => [row.slug, row.visibility]));
}

async function languageCodes() {
  const rows = await db.execute<{ value: { languages?: { code: string }[] } }>(sql`select value from settings where key = 'languages'`);
  return new Set((rows[0]?.value?.languages ?? []).map((language) => language.code));
}

async function authorNames(username?: string) {
  const rows = await db.execute<{ username: string }>(sql`
    select u.username from users u
    where u.username is not null
      ${username === undefined ? sql`` : sql`and u.username = ${username}`}
      and coalesce((select (value->>'showAuthors')::boolean from settings where key = 'site'), true)
      and exists (select 1 from pages p where coalesce(p.author_id, p.updated_by_id) = u.id
        and p.status = 'published' and p.kind = 'doc' and p.visibility = 'public')`);
  return new Set(rows.map((row) => row.username));
}

async function archivedPages(version?: string) {
  const rows = await db.execute<{ version: string; slug: string | null }>(sql`
    select v.slug as version, p.slug from doc_versions v left join doc_version_pages p on p.version_id = v.id
    ${version === undefined ? sql`` : sql`where v.slug = ${version}`}`);
  const map = new Map<string, Set<string>>();
  for (const row of rows) {
    const set = map.get(row.version) ?? new Set<string>();
    if (row.slug) set.add(row.slug);
    map.set(row.version, set);
  }
  return map;
}

async function load(): Promise<Snapshot> {
  const [pages, languages, authors, archives] = await Promise.all([publishedPages(), languageCodes(), authorNames(), archivedPages()]);
  return { pages, languages, authors, archives, at: Date.now() };
}

async function snapshot(): Promise<Snapshot> {
  let loaded = store.docskuRouteExistence;
  if (loaded && Date.now() - (await loaded.catch(() => ({ at: 0 }))).at > RELOAD_MS) loaded = undefined;
  if (!loaded) {
    loaded = load();
    store.docskuRouteExistence = loaded;
    loaded.catch(() => (store.docskuRouteExistence = undefined));
  }
  return loaded;
}

/** Drops the in-memory copy; call after anything that can make a public path disappear (or appear). */
export function forgetRouteExistence() {
  store.docskuRouteExistence = undefined;
}

async function validSession(token: string | undefined) {
  if (!token) return false;
  const id = createHash("sha256").update(token).digest("hex");
  const rows = await db.execute(sql`select 1 from sessions where id = ${id} and expires_at > now() limit 1`);
  return rows.length > 0;
}

/** A page's visibility from the snapshot, or a fresh look-up when it isn't there (a page published meanwhile). */
async function pageVisibility(slug: string): Promise<string | undefined> {
  const known = (await snapshot()).pages.get(slug);
  if (known) return known;
  return (await publishedPages(slug)).get(slug);
}

/**
 * /docs/<path>: a published doc page (internal ones only for a signed-in user) or an extra
 * language's hub; "internal" pages are served with `private, no-store`.
 */
export async function docPathAccess(path: string, sessionToken: string | undefined): Promise<"public" | "internal" | "missing"> {
  // /docs/v/<version>[/<slug>]: an archived version (or its hub).
  const archived = path.match(/^v\/([^/]+)(?:\/(.+))?$/);
  if (archived) {
    const pagesOf = (await snapshot()).archives.get(archived[1]) ?? (await archivedPages(archived[1])).get(archived[1]);
    if (!pagesOf) return "missing";
    return !archived[2] || pagesOf.has(archived[2]) ? "public" : "missing";
  }
  const visibility = await pageVisibility(path);
  if (visibility === "public") return "public";
  if (visibility === "internal") return (await validSession(sessionToken)) ? "internal" : "missing";
  return !path.includes("/") && (await languageHomeExists(path)) ? "public" : "missing";
}

/** /<code>: an enabled extra language (its home, or a redirect to its docs hub). */
export async function languageHomeExists(code: string): Promise<boolean> {
  if ((await snapshot()).languages.has(code)) return true;
  return (await languageCodes()).has(code);
}

/** /penulis/<username>: authors are shown and this one has a published public page. */
export async function authorExists(username: string): Promise<boolean> {
  if ((await snapshot()).authors.has(username)) return true;
  return (await authorNames(username)).has(username);
}

/** /widget/a/<slug>: a published public doc page (proxy.ts checks that the widget is switched on). */
export async function widgetArticleExists(slug: string): Promise<boolean> {
  return (await pageVisibility(slug)) === "public";
}

export { SESSION_COOKIE as PROXY_SESSION_COOKIE };
