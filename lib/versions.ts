import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { JSONContent } from "@tiptap/core";
import { buildingWithoutDatabase, db, schema } from "@/db";
import { getNavigation } from "@/lib/data/site";
import { isGroup } from "@/lib/navigation";
import type { NavItem, NavTab } from "@/lib/site-types";

/**
 * Documentation versions. The live docs are the newest version (its label is
 * settings key `versions`, e.g. "v2"); archiving copies every public published
 * page (default language) and the navigation into doc_versions /
 * doc_version_pages, read-only at /docs/v/<slug>/…. Links between archived
 * pages are rewritten to stay inside the version.
 */

export const VERSION_SLUG = /^[a-z0-9][a-z0-9.-]{0,30}$/;
export const versionHref = (version: string, slug?: string) => `/docs/v/${version}${slug ? `/${slug}` : ""}`;

export type VersionSettings = { currentLabel: string };
export const DEFAULT_VERSIONS: VersionSettings = { currentLabel: "Terbaru" };

export type VersionInfo = { id: string; slug: string; label: string; note: string; createdAt: string; pages: number };
/** For the header picker and the sidebar: each archived version with its navigation. */
export type VersionNav = { slug: string; label: string; tabs: NavTab[] };

export async function getVersionSettings(): Promise<VersionSettings> {
  "use cache";
  cacheTag("settings");
  cacheLife("max");
  if (buildingWithoutDatabase) return DEFAULT_VERSIONS;
  const [row] = await db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, "versions"));
  return { ...DEFAULT_VERSIONS, ...((row?.value as Partial<VersionSettings> | undefined) ?? {}) };
}

/** Archived versions, newest first. */
export async function getVersions(): Promise<VersionInfo[]> {
  "use cache";
  cacheTag("versions");
  cacheLife("max");
  if (buildingWithoutDatabase) return [];
  const rows = await db
    .select({
      id: schema.docVersions.id,
      slug: schema.docVersions.slug,
      label: schema.docVersions.label,
      note: schema.docVersions.note,
      createdAt: schema.docVersions.createdAt,
      pages: sql<number>`(select count(*)::int from doc_version_pages p where p.version_id = ${schema.docVersions.id})`,
    })
    .from(schema.docVersions)
    .orderBy(desc(schema.docVersions.createdAt));
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

export async function getVersionNavs(): Promise<VersionNav[]> {
  "use cache";
  cacheTag("versions");
  cacheLife("max");
  if (buildingWithoutDatabase) return [];
  const rows = await db
    .select({ slug: schema.docVersions.slug, label: schema.docVersions.label, navigation: schema.docVersions.navigation })
    .from(schema.docVersions)
    .orderBy(desc(schema.docVersions.createdAt));
  return rows.map((row) => ({ slug: row.slug, label: row.label, tabs: row.navigation as NavTab[] }));
}

export async function getVersionPage(version: string, slug: string) {
  "use cache";
  cacheTag("versions");
  cacheLife("max");
  if (buildingWithoutDatabase) return null;
  const [row] = await db
    .select({
      label: schema.docVersions.label,
      title: schema.docVersionPages.title,
      description: schema.docVersionPages.description,
      content: schema.docVersionPages.content,
      publishedAt: schema.docVersionPages.publishedAt,
    })
    .from(schema.docVersionPages)
    .innerJoin(schema.docVersions, eq(schema.docVersions.id, schema.docVersionPages.versionId))
    .where(and(eq(schema.docVersions.slug, version), eq(schema.docVersionPages.slug, slug)));
  return row ? { ...row, publishedAt: row.publishedAt?.toISOString() ?? null } : null;
}

/** Every page of a version (for its hub), in navigation order where listed. */
export async function getVersionPages(version: string) {
  "use cache";
  cacheTag("versions");
  cacheLife("max");
  if (buildingWithoutDatabase) return [];
  return db
    .select({ slug: schema.docVersionPages.slug, title: schema.docVersionPages.title, description: schema.docVersionPages.description })
    .from(schema.docVersionPages)
    .innerJoin(schema.docVersions, eq(schema.docVersions.id, schema.docVersionPages.versionId))
    .where(eq(schema.docVersions.slug, version))
    .orderBy(asc(schema.docVersionPages.title));
}

/* ------------------------------------------------------------- archiving -- */

/** /docs/<slug>[#…] → /docs/v/<version>/<slug>[#…] when that page is in the version. */
function rewriteHref(href: unknown, version: string, slugs: Set<string>): unknown {
  if (typeof href !== "string") return href;
  const match = href.match(/^\/docs\/([^#?]+)(.*)$/);
  if (!match || !slugs.has(match[1].replace(/\/+$/, ""))) return href;
  return `${versionHref(version, match[1].replace(/\/+$/, ""))}${match[2]}`;
}

function rewriteDoc(node: JSONContent, version: string, slugs: Set<string>): JSONContent {
  const attrs = node.attrs && "href" in node.attrs ? { ...node.attrs, href: rewriteHref(node.attrs.href, version, slugs) } : node.attrs;
  const marks = node.marks?.map((mark) => (mark.type === "link" ? { ...mark, attrs: { ...mark.attrs, href: rewriteHref(mark.attrs?.href, version, slugs) } } : mark));
  return {
    ...node,
    ...(attrs ? { attrs } : {}),
    ...(marks ? { marks } : {}),
    ...(node.content ? { content: node.content.map((child) => rewriteDoc(child, version, slugs)) } : {}),
  };
}

function rewriteItems(items: NavItem[], version: string, slugs: Set<string>): NavItem[] {
  return items.flatMap((item): NavItem[] => {
    if (isGroup(item)) {
      const children = rewriteItems(item.items, version, slugs);
      return children.length ? [{ ...item, items: children }] : [];
    }
    const href = rewriteHref(item.href, version, slugs) as string;
    // Links to pages that aren't archived (external links stay as they are).
    return href.startsWith("/docs/") && !href.startsWith("/docs/v/") ? [] : [{ ...item, href }];
  });
}

/** Snapshot of the live docs as version `slug`. Returns the number of pages, or an error. */
export async function archiveCurrentDocs(input: { slug: string; label: string; note: string; userId: string }): Promise<{ ok: true; pages: number } | { ok: false; error: string }> {
  const [taken] = await db.select({ id: schema.docVersions.id }).from(schema.docVersions).where(eq(schema.docVersions.slug, input.slug));
  if (taken) return { ok: false, error: `Versi “${input.slug}” sudah ada.` };
  const pages = await db
    .select({ slug: schema.pages.slug, title: schema.pages.title, description: schema.pages.description, content: schema.pages.content, publishedAt: schema.pages.publishedAt })
    .from(schema.pages)
    .where(and(eq(schema.pages.status, "published"), eq(schema.pages.kind, "doc"), eq(schema.pages.visibility, "public"), isNull(schema.pages.translationOf)));
  if (!pages.length) return { ok: false, error: "Belum ada halaman terbit untuk diarsipkan." };
  const slugs = new Set(pages.map((page) => page.slug));
  const tabs = (await getNavigation())
    .map((tab) => {
      const sections = tab.sections.map((section) => ({ ...section, items: rewriteItems(section.items, input.slug, slugs) })).filter((section) => section.items.length);
      const first = sections.flatMap((section) => section.items).find((item): item is { title: string; href: string } => !isGroup(item));
      return { ...tab, href: first?.href ?? versionHref(input.slug), sections };
    })
    .filter((tab) => tab.sections.length);
  await db.transaction(async (tx) => {
    const [version] = await tx
      .insert(schema.docVersions)
      .values({ slug: input.slug, label: input.label, note: input.note, navigation: tabs, createdById: input.userId })
      .returning({ id: schema.docVersions.id });
    await tx.insert(schema.docVersionPages).values(
      pages.map((page) => ({
        versionId: version.id,
        slug: page.slug,
        title: page.title,
        description: page.description,
        content: rewriteDoc(page.content, input.slug, slugs),
        publishedAt: page.publishedAt,
      })),
    );
  });
  return { ok: true, pages: pages.length };
}
