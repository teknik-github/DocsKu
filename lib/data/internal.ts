import "server-only";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth/dal";
import { readNavigation } from "@/lib/automation";
import { listedIn } from "@/lib/categories";

/**
 * Internal articles: published doc pages with `visibility = 'internal'`. They
 * are left out of every public (cached) read in lib/data/site.ts, and are read
 * here, uncached, only after the session has been checked on the server.
 */

const internalPage = and(eq(schema.pages.status, "published"), eq(schema.pages.kind, "doc"), eq(schema.pages.visibility, "internal"));

/** A published internal page for a signed-in team member, or null (also for visitors). */
export async function getInternalPage(slug: string) {
  if (!(await getCurrentUser())) return null;
  const [page] = await db
    .select({
      id: schema.pages.id,
      slug: schema.pages.slug,
      title: schema.pages.title,
      description: schema.pages.description,
      content: schema.pages.content,
      seo: schema.pages.seo,
      coverImage: schema.pages.coverImage,
      publishedAt: schema.pages.publishedAt,
      updatedAt: schema.pages.updatedAt,
      authorId: sql<string | null>`coalesce(${schema.pages.authorId}, ${schema.pages.updatedById})`,
    })
    .from(schema.pages)
    .where(and(eq(schema.pages.slug, slug), internalPage));
  return page ?? null;
}

export type InternalGroup = { id: string; title: string; group: string | null; pages: { id: string; slug: string; title: string; description: string; publishedAt: string | null }[] };

/**
 * Every published internal page, grouped by the category (navigation section)
 * listing it, in navigation order; unlisted ones last. Callers check the session.
 */
export async function listInternalPages(): Promise<InternalGroup[]> {
  const [rows, navigation] = await Promise.all([
    db
      .select({
        id: schema.pages.id,
        slug: schema.pages.slug,
        title: schema.pages.title,
        description: schema.pages.description,
        publishedAt: schema.pages.publishedAt,
      })
      .from(schema.pages)
      // Originals only; translations are reached from their original's language versions.
      .where(and(internalPage, isNull(schema.pages.translationOf)))
      .orderBy(asc(schema.pages.title)),
    readNavigation(),
  ]);
  const listed = listedIn(navigation);
  const groups = new Map<string, InternalGroup>();
  // Sections in navigation order first.
  for (const tab of navigation.tabs) for (const section of tab.sections) groups.set(section.id, { id: section.id, title: section.title, group: tab.title, pages: [] });
  const other: InternalGroup = { id: "", title: "Tanpa kategori", group: null, pages: [] };
  for (const row of rows) {
    const sectionId = listed.get(row.id);
    const target = (sectionId && groups.get(sectionId)) || other;
    target.pages.push({ ...row, publishedAt: row.publishedAt?.toISOString() ?? null });
  }
  return [...groups.values(), other].filter((group) => group.pages.length > 0);
}
