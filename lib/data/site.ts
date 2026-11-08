import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { buildingWithoutDatabase, db, schema } from "@/db";
import type { JSONContent } from "@tiptap/core";
import { textOf, tocHeadings } from "@/lib/content/doc";
import { allPages, slugToHref, tabPages } from "@/lib/navigation";
import { DEFAULT_COVER_COLOR } from "@/lib/cover-palette";
import { isAiReady } from "@/lib/ai/config";
import { parseHomeSections } from "@/lib/home-schema";
import type {
  HomeSection,
  AskAiSettings,
  AutomationSettings,
  CommentSettings,
  CoverShape,
  NavItem,
  NavItemData,
  NavigationData,
  NavTab,
  PageCard,
  SearchEntry,
  SiteSettings,
  WidgetSettings,
} from "@/lib/site-types";
import { DEFAULT_WIDGET } from "@/lib/widget";
import { type Alternates, DEFAULT_LANGUAGES, type LanguageSettings } from "@/lib/i18n";

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
  if (buildingWithoutDatabase) return undefined;
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

export const DEFAULT_COMMENTS: CommentSettings = { enabled: true, moderation: false };

/** Whether docs pages show comments, and whether new ones wait for approval (settings key "comments"). */
export async function getCommentSettings(): Promise<CommentSettings> {
  "use cache";
  cacheTag("settings");
  cacheLife("max");
  return { ...DEFAULT_COMMENTS, ...(await readSetting<Partial<CommentSettings>>("comments")) };
}

/** The published home sections (settings key "home"), or null when the builder was never used. */
export async function getHomeSections(): Promise<HomeSection[] | null> {
  "use cache";
  cacheTag("settings");
  cacheLife("max");
  return parseHomeSections(await readSetting<unknown>("home"));
}

export const DEFAULT_ASK_AI: AskAiSettings = { enabled: true, perMinute: 5, dailyLimit: 500 };

/** "Tanya AI" in the search box (settings key "ask_ai"). */
export async function getAskAiSettings(): Promise<AskAiSettings> {
  "use cache";
  cacheTag("settings");
  cacheLife("max");
  return { ...DEFAULT_ASK_AI, ...(await readSetting<Partial<AskAiSettings>>("ask_ai")) };
}

/** Whether the search box offers "Tanya AI": switched on, and AI is set up (Pengaturan → AI). */
export async function getAskAiAvailable(): Promise<boolean> {
  "use cache";
  cacheTag("settings");
  cacheLife("max");
  if (buildingWithoutDatabase) return false;
  const [settings, ready] = await Promise.all([getAskAiSettings(), isAiReady()]);
  return settings.enabled && settings.dailyLimit > 0 && ready;
}

/** Languages (settings key "languages", Pengaturan → Bahasa). Originals are in `defaultLocale`. */
export async function getLanguageSettings(): Promise<LanguageSettings> {
  "use cache";
  cacheTag("settings");
  cacheLife("max");
  const stored = await readSetting<Partial<LanguageSettings>>("languages");
  return { ...DEFAULT_LANGUAGES, ...stored, languages: stored?.languages ?? [] };
}

/** The embeddable help widget (settings key "widget", Pengaturan → Widget bantuan). */
export async function getWidgetSettings(): Promise<WidgetSettings> {
  "use cache";
  cacheTag("settings");
  cacheLife("max");
  return { ...DEFAULT_WIDGET, ...(await readSetting<Partial<WidgetSettings>>("widget")) };
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
  if (buildingWithoutDatabase) return [];
  return db
    .select({ id: schema.pages.id, slug: schema.pages.slug, title: schema.pages.title, locale: schema.pages.locale, translationOf: schema.pages.translationOf })
    .from(schema.pages)
    .where(and(eq(schema.pages.status, "published"), eq(schema.pages.kind, "doc"), eq(schema.pages.visibility, "public")));
}

type IndexedPage = { id: string; slug: string; title: string; locale: string; translationOf: string | null };

/**
 * Original page id → the page shown for it in `locale`: the default language
 * gets the originals; another language gets its published translation, or
 * (with `missing: "fallback"`) the original.
 */
async function pagesForLocale(locale: string | undefined): Promise<Map<string, IndexedPage>> {
  const [published, languages] = await Promise.all([getPublishedPageIndex(), getLanguageSettings()]);
  const originals = published.filter((page) => !page.translationOf);
  if (!locale || locale === languages.defaultLocale || !languages.languages.some((l) => l.code === locale)) {
    return new Map(originals.map((page) => [page.id, page]));
  }
  const map = new Map<string, IndexedPage>(languages.missing === "fallback" ? originals.map((page) => [page.id, page]) : []);
  for (const page of published) if (page.translationOf && page.locale === locale) map.set(page.translationOf, page);
  return map;
}

function resolveItems(
  items: NavItemData[],
  pagesById: Map<string, { slug: string; title: string; translationOf?: string | null }>,
): NavItem[] {
  return items.flatMap((item): NavItem[] => {
    if (item.type === "page") {
      const page = pagesById.get(item.pageId);
      // A custom label is written in the default language; a translation shows its own title.
      return page ? [{ title: (!page.translationOf && item.title) || page.title, href: slugToHref(page.slug) }] : [];
    }
    if (item.type === "link") return [{ title: item.title, href: item.href }];
    const children = resolveItems(item.items, pagesById);
    return children.length ? [{ title: item.title, items: children }] : [];
  });
}

/**
 * Header tabs and sidebars, containing only published pages. Without `locale`
 * (or with the default language) the originals; otherwise each page's
 * translation, with tab and section titles from their `titles[locale]`.
 */
export async function getNavigation(locale?: string): Promise<NavTab[]> {
  "use cache";
  cacheTag("navigation", "pages", "settings");
  cacheLife("max");
  const [navigation, pagesById] = await Promise.all([readSetting<NavigationData>("navigation"), pagesForLocale(locale)]);
  return (navigation?.tabs ?? []).flatMap((tab) => {
    const sections = tab.sections
      .map((section) => ({ title: (locale && section.titles?.[locale]) || section.title, image: section.image, items: resolveItems(section.items, pagesById) }))
      .filter((section) => section.items.length > 0);
    const resolved: NavTab = { title: (locale && tab.titles?.[locale]) || tab.title, href: "", sections };
    const first = tabPages(resolved)[0];
    return first ? [{ ...resolved, href: first.href }] : [];
  });
}

export async function getPublishedPage(slug: string) {
  "use cache";
  cacheTag("pages");
  cacheLife("max");
  if (buildingWithoutDatabase) return null;
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
      /** Shown as the article's author (lib/data/authors.ts): the creator, or the last editor for older pages. */
      authorId: sql<string | null>`coalesce(${schema.pages.authorId}, ${schema.pages.updatedById})`,
    })
    .from(schema.pages)
    .where(and(eq(schema.pages.slug, slug), eq(schema.pages.status, "published"), eq(schema.pages.kind, "doc"), eq(schema.pages.visibility, "public")));
  return page ?? null;
}

/** The published block-edited home page, or null to use the built-in one. */
export async function getHomePage() {
  "use cache";
  cacheTag("pages");
  cacheLife("max");
  if (buildingWithoutDatabase) return null;
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

/** The search dialog's entries for one language (the default without `locale`). */
export async function getSearchIndex(locale?: string): Promise<SearchEntry[]> {
  "use cache";
  cacheTag("navigation", "pages", "settings");
  cacheLife("max");
  if (buildingWithoutDatabase) return [];
  const [tabs, rows] = await Promise.all([
    getNavigation(locale),
    db
      .select({
        slug: schema.pages.slug,
        description: schema.pages.description,
        content: schema.pages.content,
      })
      .from(schema.pages)
      .where(and(eq(schema.pages.status, "published"), eq(schema.pages.kind, "doc"), eq(schema.pages.visibility, "public"))),
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

/**
 * Card data (cover, excerpt, reading time, date) for every published docs page
 * shown in one language: the originals without `locale`, otherwise that
 * language's translations (plus untranslated originals with `missing: "fallback"`).
 */
export async function getPageCards(locale?: string): Promise<PageCard[]> {
  "use cache";
  cacheTag("pages", "settings");
  cacheLife("max");
  if (buildingWithoutDatabase) return [];
  const [{ cover: autoCover, coverColor }, shown] = await Promise.all([getAutomation(), pagesForLocale(locale)]);
  const wanted = new Set([...shown.values()].map((page) => page.id));
  const all = await db
    .select({
      id: schema.pages.id,
      slug: schema.pages.slug,
      title: schema.pages.title,
      description: schema.pages.description,
      content: schema.pages.content,
      coverImage: schema.pages.coverImage,
      publishedAt: schema.pages.publishedAt,
      featured: schema.pages.featured,
    })
    .from(schema.pages)
    .where(and(eq(schema.pages.status, "published"), eq(schema.pages.kind, "doc"), eq(schema.pages.visibility, "public")));
  const rows = all.filter((row) => wanted.has(row.id));
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

/**
 * Hrefs of the most read published docs pages over the last 30 days, most read first.
 * Views are counted without invalidating tags, so this refreshes hourly.
 */
export async function getPopularPages(limit = 6, locale?: string): Promise<string[]> {
  "use cache";
  cacheTag("pages", "settings");
  cacheLife("hours");
  if (buildingWithoutDatabase) return [];
  const views = sql<number>`sum(${schema.pageViews.views})`;
  const rows = await db
    .select({ slug: schema.pages.slug })
    .from(schema.pageViews)
    .innerJoin(schema.pages, eq(schema.pages.id, schema.pageViews.pageId))
    .where(
      and(
        eq(schema.pages.status, "published"),
        eq(schema.pages.kind, "doc"),
        eq(schema.pages.visibility, "public"),
        // Originals for the default language, otherwise that language's translations.
        locale && locale !== (await getLanguageSettings()).defaultLocale
          ? and(eq(schema.pages.locale, locale), sql`${schema.pages.translationOf} is not null`)
          : isNull(schema.pages.translationOf),
        gte(schema.pageViews.day, sql`(now() at time zone 'Asia/Jakarta')::date - 30`),
      ),
    )
    .groupBy(schema.pages.slug)
    .orderBy(desc(views))
    .limit(limit);
  return rows.map((row) => slugToHref(row.slug));
}

/**
 * Every published public page that has translations, mapped to all versions
 * of it by language ({ id: "/docs/x", en: "/docs/en/x" }), for the language
 * switcher and hreflang. Pages without translations are left out.
 */
export async function getTranslationAlternates(): Promise<Record<string, Alternates>> {
  "use cache";
  cacheTag("pages", "settings");
  cacheLife("max");
  const [published, languages] = await Promise.all([getPublishedPageIndex(), getLanguageSettings()]);
  if (!languages.languages.length) return {};
  const enabled = new Set(languages.languages.map((l) => l.code));
  const byId = new Map(published.map((page) => [page.id, page]));
  const groups = new Map<string, Alternates>();
  for (const page of published) {
    if (!page.translationOf || !enabled.has(page.locale)) continue;
    const original = byId.get(page.translationOf);
    if (!original) continue;
    const group = groups.get(original.id) ?? { [languages.defaultLocale]: slugToHref(original.slug) };
    group[page.locale] = slugToHref(page.slug);
    groups.set(original.id, group);
  }
  const result: Record<string, Alternates> = {};
  for (const group of groups.values()) for (const href of Object.values(group)) result[href] = group;
  return result;
}
