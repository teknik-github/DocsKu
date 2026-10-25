import "server-only";
import { and, eq, isNull, ne, or } from "drizzle-orm";
import { db, schema } from "@/db";

/** Prefix of the placeholder slug new pages get before they have a title. */
export const PLACEHOLDER_SLUG = "tanpa-judul";

export function slugify(text: string) {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "halaman"
  );
}

/**
 * `base`, or `base-2`, `base-3`, … if another page already uses it. Paths kept
 * as redirects (old addresses of other pages) count as taken, so they keep working.
 */
export async function uniqueSlug(base: string, exceptId?: string) {
  for (let i = 0; i < 100; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const [taken] = await db
      .select({ id: schema.pages.id })
      .from(schema.pages)
      .where(exceptId ? and(eq(schema.pages.slug, candidate), ne(schema.pages.id, exceptId)) : eq(schema.pages.slug, candidate));
    if (taken) continue;
    const [redirected] = await db
      .select({ id: schema.redirects.id })
      .from(schema.redirects)
      .where(exceptId ? and(eq(schema.redirects.fromPath, candidate), or(isNull(schema.redirects.pageId), ne(schema.redirects.pageId, exceptId))) : eq(schema.redirects.fromPath, candidate));
    if (!redirected) return candidate;
  }
  return `${base}-${Date.now()}`;
}
