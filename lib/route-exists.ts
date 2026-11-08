import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Existence checks for proxy.ts, so a missing page answers with a real HTTP 404.
 *
 * With Cache Components and Partial Prefetching, a URL whose params weren't
 * prerendered gets the route's App Shell at once, and the status is then fixed
 * at 200 even when the page later calls notFound(). The proxy runs before that,
 * so it asks the database (one indexed query, uncached, so a page published a
 * second ago is never a 404) and rewrites misses to an unmatched path.
 *
 * An internal article counts only for a valid session, so a visitor gets the
 * same 404 for it as for a slug that doesn't exist.
 */

const SESSION_COOKIE = "docsku_session";

async function validSession(token: string | undefined) {
  if (!token) return false;
  const id = createHash("sha256").update(token).digest("hex");
  const rows = await db.execute(sql`select 1 from sessions where id = ${id} and expires_at > now() limit 1`);
  return rows.length > 0;
}

async function languageCodes(): Promise<string[]> {
  const rows = await db.execute<{ value: { languages?: { code: string }[] } }>(sql`select value from settings where key = 'languages'`);
  return (rows[0]?.value?.languages ?? []).map((language) => language.code);
}

/** /docs/<path>: a published doc page (internal ones only for a signed-in user) or an extra language's hub. */
export async function docPathExists(path: string, sessionToken: string | undefined): Promise<boolean> {
  const rows = await db.execute<{ visibility: string }>(
    sql`select visibility from pages where slug = ${path} and status = 'published' and kind = 'doc' limit 1`,
  );
  if (rows[0]?.visibility === "public") return true;
  if (rows[0]?.visibility === "internal") return validSession(sessionToken);
  return !path.includes("/") && (await languageCodes()).includes(path);
}

/** /<code>: an enabled extra language (its home, or a redirect to its docs hub). */
export async function languageHomeExists(code: string): Promise<boolean> {
  return (await languageCodes()).includes(code);
}

/** /penulis/<username>: authors are shown and this one has a published public page. */
export async function authorExists(username: string): Promise<boolean> {
  const rows = await db.execute(sql`
    select 1 from users u
    where u.username = ${username}
      and coalesce((select (value->>'showAuthors')::boolean from settings where key = 'site'), true)
      and exists (select 1 from pages p where coalesce(p.author_id, p.updated_by_id) = u.id
        and p.status = 'published' and p.kind = 'doc' and p.visibility = 'public')
    limit 1`);
  return rows.length > 0;
}

/** /widget/a/<slug>: a published public doc page (the widget itself checks that it is switched on). */
export async function widgetArticleExists(slug: string): Promise<boolean> {
  const rows = await db.execute(sql`select 1 from pages where slug = ${slug} and status = 'published' and kind = 'doc' and visibility = 'public' limit 1`);
  return rows.length > 0;
}

export { SESSION_COOKIE as PROXY_SESSION_COOKIE };
