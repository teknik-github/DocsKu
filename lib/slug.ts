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
  // An enabled language code ("en") is the hub of that language, and "en/…" its pages.
  const [languages] = await db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, "languages"));
  const reserved = new Set(((languages?.value as { languages?: { code: string }[] } | undefined)?.languages ?? []).map((l) => l.code));
  // /docs/v/… holds archived documentation versions.
  reserved.add("v");
  for (let i = 0; i < 100; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    if (reserved.has(candidate.split("/")[0])) continue;
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
