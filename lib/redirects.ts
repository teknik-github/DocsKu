import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * Redirects for old /docs paths, served by proxy.ts. The table is small, so
 * the proxy keeps all live redirects in memory and reloads them after a change
 * (or every RELOAD_MS, for other instances and pages published meanwhile).
 */

type Target = { id: string; url: string };
type Loaded = { map: Map<string, Target>; at: number };

const RELOAD_MS = 60_000;
// globalThis, so server actions and the proxy (separate bundles, one process) share it.
const store = globalThis as unknown as { docskuRedirects?: Promise<Loaded> };

/** "/docs/a/b/" or "a/b" → "a/b". */
export function normalisePath(path: string) {
  return path
    .trim()
    .replace(/^\/?docs(?=\/|$)/, "")
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase();
}

async function load(): Promise<Loaded> {
  const pages = schema.pages;
  const rows = await db
    .select({ id: schema.redirects.id, from: schema.redirects.fromPath, slug: pages.slug, toUrl: schema.redirects.toUrl })
    .from(schema.redirects)
    .leftJoin(pages, and(eq(pages.id, schema.redirects.pageId), eq(pages.kind, "doc"), eq(pages.status, "published")))
    // A published page always wins over a redirect from its own path.
    .where(sql`not exists (select 1 from ${pages} where ${pages.slug} = ${schema.redirects.fromPath} and ${pages.status} = 'published')`);
  const map = new Map<string, Target>();
  for (const row of rows) {
    // Automatic redirects follow their page; one whose page is off the site falls through to 404.
    const url = row.slug ? `/docs/${row.slug}` : row.toUrl;
    if (url && url !== `/docs/${row.from}`) map.set(row.from, { id: row.id, url });
  }
  return { map, at: Date.now() };
}

/** Where an old /docs path (normalised) should go, or null. */
export async function findRedirect(path: string): Promise<Target | null> {
  let loaded = store.docskuRedirects;
  if (loaded && Date.now() - (await loaded).at > RELOAD_MS) loaded = undefined;
  if (!loaded) {
    loaded = load();
    store.docskuRedirects = loaded;
    loaded.catch(() => (store.docskuRedirects = undefined));
  }
  return (await loaded).map.get(path) ?? null;
}

export function forgetRedirects() {
  store.docskuRedirects = undefined;
}

export async function countHit(id: string) {
  await db
    .update(schema.redirects)
    .set({ hits: sql`${schema.redirects.hits} + 1`, lastHitAt: sql`now()` })
    .where(eq(schema.redirects.id, id));
}

/**
 * Keeps the old address of a page working after its slug changes: the old
 * path redirects to the page (whatever its slug becomes later), and the new
 * path stops redirecting anywhere because the page now owns it.
 */
export async function recordSlugChange(pageId: string, oldSlug: string, newSlug: string) {
  if (oldSlug === newSlug) return;
  await db.transaction(async (tx) => {
    await tx.delete(schema.redirects).where(eq(schema.redirects.fromPath, newSlug));
    await tx
      .insert(schema.redirects)
      .values({ fromPath: oldSlug, pageId, auto: true })
      .onConflictDoUpdate({ target: schema.redirects.fromPath, set: { pageId, toUrl: null, auto: true } });
  });
  forgetRedirects();
}
