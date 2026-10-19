import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { JSONContent } from "@tiptap/core";
import { textOf, tocHeadings } from "@/lib/content/doc";
import { allPages, slugToHref, tabPages } from "@/lib/navigation";
import { DEFAULT_COVER_COLOR } from "@/lib/cover-palette";
import type {
  AutomationSettings,
  CoverShape,
  NavItem,
  NavItemData,
  NavigationData,
  NavTab,
  PageCard,
  SearchEntry,
  SiteSettings,
} from "@/lib/site-types";

/**
 * Public, cached reads. Every function is tagged, and dashboard mutations call
 * `updateTag` with the same tags (see lib/data/tags.ts), so visitors see
 * changes right after they're saved.
 */

export const DEFAULT_SITE: SiteSettings = {
  layout: "docs",
  name: "Docsku",
  description: "Dokumentasi.",
  headerCta: null,
  resources: [],
  footer: [],
};

async function readSetting<T>(key: string): Promise<T | undefined> {
  const [row] = await db
    .select({ value: schema.settings.value })
    .from(schema.settings)
    .where(eq(schema.settings.key, key));
  return row?.value as T | undefined;
}

export async function getSiteSettings(): Promise<SiteSettings> {
  "use cache";
  cacheTag("settings");
  cacheLife("max");
  return { ...DEFAULT_SITE, ...(await readSetting<Partial<SiteSettings>>("site")) };
}

export const DEFAULT_AUTOMATION: AutomationSettings = {
  navigation: true,
  slug: true,
  description: true,
  seo: true,
  cover: true,
  coverColor: DEFAULT_COVER_COLOR,
};

/** Automation settings for public rendering (generated covers). */
export async function getAutomation(): Promise<AutomationSettings> {
  "use cache";
  cacheTag("settings");
  cacheLife("max");
  return { ...DEFAULT_AUTOMATION, ...(await readSetting<Partial<AutomationSettings>>("automation")) };
}

/**
 * Address of the generated cover for a published page, in the shape it is shown
 * at, so object-fit never crops its text: "card" (16:10 cards), "wide"
 * (article header), or "og" (social preview, 1200×630).
 */
export function generatedCover(slug: string, shape: CoverShape, color: string) {
  // The colour is read from the settings by the route; it is in the URL only so browsers refetch after a change.
  const params = new URLSearchParams({ ...(shape === "og" ? {} : { shape }), c: color.replace("#", "") });
  return `/cover/${slug}?${params}`;
}

async function getPublishedPageIndex() {
  return db
    .select({ id: schema.pages.id, slug: schema.pages.slug, title: schema.pages.title })
    .from(schema.pages)
    .where(and(eq(schema.pages.status, "published"), eq(schema.pages.kind, "doc")));
}

function resolveItems(
  items: NavItemData[],
  pagesById: Map<string, { slug: string; title: string }>,
): NavItem[] {
  return items.flatMap((item): NavItem[] => {
    if (item.type === "page") {
      const page = pagesById.get(item.pageId);
      return page ? [{ title: item.title || page.title, href: slugToHref(page.slug) }] : [];
    }
    if (item.type === "link") return [{ title: item.title, href: item.href }];
    const children = resolveItems(item.items, pagesById);
    return children.length ? [{ title: item.title, items: children }] : [];
  });
}

/** Header tabs and sidebars, containing only published pages. */
export async function getNavigation(): Promise<NavTab[]> {
  "use cache";
  cacheTag("navigation", "pages");
  cacheLife("max");
  const [navigation, published] = await Promise.all([
    readSetting<NavigationData>("navigation"),
    getPublishedPageIndex(),
  ]);
  const pagesById = new Map(published.map((page) => [page.id, page]));
  return (navigation?.tabs ?? []).flatMap((tab) => {
    const sections = tab.sections
      .map((section) => ({ title: section.title, items: resolveItems(section.items, pagesById) }))
      .filter((section) => section.items.length > 0);
    const resolved: NavTab = { title: tab.title, href: "", sections };
    const first = tabPages(resolved)[0];
    return first ? [{ ...resolved, href: first.href }] : [];
  });
}

export async function getPublishedPage(slug: string) {
  "use cache";
  cacheTag("pages");
  cacheLife("max");
  const [page] = await db
    .select({
      slug: schema.pages.slug,
      title: schema.pages.title,
      description: schema.pages.description,
      content: schema.pages.content,
      seo: schema.pages.seo,
      coverImage: schema.pages.coverImage,
      publishedAt: schema.pages.publishedAt,
      updatedAt: schema.pages.updatedAt,
    })
    .from(schema.pages)
    .where(and(eq(schema.pages.slug, slug), eq(schema.pages.status, "published"), eq(schema.pages.kind, "doc")));
  return page ?? null;
}

/** The published block-edited home page, or null to use the built-in one. */
export async function getHomePage() {
  "use cache";
  cacheTag("pages");
  cacheLife("max");
  const [page] = await db
    .select({ title: schema.pages.title, description: schema.pages.description, content: schema.pages.content, seo: schema.pages.seo })
    .from(schema.pages)
    .where(and(eq(schema.pages.kind, "home"), eq(schema.pages.status, "published")));
  return page ?? null;
}

export async function getPublishedSlugs(): Promise<string[]> {
  "use cache";
  cacheTag("pages");
  cacheLife("max");
  return (await getPublishedPageIndex()).map((page) => page.slug);
}

export async function getSearchIndex(): Promise<SearchEntry[]> {
  "use cache";
  cacheTag("navigation", "pages");
  cacheLife("max");
  const [tabs, rows] = await Promise.all([
    getNavigation(),
    db
      .select({
        slug: schema.pages.slug,
        description: schema.pages.description,
        content: schema.pages.content,
      })
      .from(schema.pages)
      .where(and(eq(schema.pages.status, "published"), eq(schema.pages.kind, "doc"))),
  ]);
  const bySlug = new Map(rows.map((row) => [slugToHref(row.slug), row]));
  return allPages(tabs).flatMap((page) => {
    const row = bySlug.get(page.href);
    if (!row) return [];
    return [
      {
        href: page.href,
        title: page.title,
        description: row.description,
        section: page.section,
        tab: page.tab,
        headings: tocHeadings(row.content),
      },
    ];
  });
}

/** Roughly 200 words a minute, at least one minute. */
export function readingMinutes(doc: JSONContent) {
  const words = textOf(doc).trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/** Card data (cover, excerpt, reading time, date) for every published docs page. */
export async function getPageCards(): Promise<PageCard[]> {
  "use cache";
  cacheTag("pages");
  cacheLife("max");
  const { cover: autoCover, coverColor } = await getAutomation();
  const rows = await db
    .select({
      slug: schema.pages.slug,
      title: schema.pages.title,
      description: schema.pages.description,
      content: schema.pages.content,
      coverImage: schema.pages.coverImage,
      publishedAt: schema.pages.publishedAt,
      featured: schema.pages.featured,
    })
    .from(schema.pages)
    .where(and(eq(schema.pages.status, "published"), eq(schema.pages.kind, "doc")));
  return rows.map((row) => ({
    href: slugToHref(row.slug),
    title: row.title,
    description: row.description,
    cover: row.coverImage ?? (autoCover ? generatedCover(row.slug, "card", coverColor) : null),
    readingMinutes: readingMinutes(row.content),
    publishedAt: row.publishedAt?.toISOString() ?? null,
    featured: row.featured,
  }));
}
