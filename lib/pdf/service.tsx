import "server-only";
import { createHash } from "node:crypto";
import { renderToBuffer } from "@react-pdf/renderer";
import { COLOR_THEMES, colorThemeOf } from "@/lib/color-themes";
import { getLanguageSettings, getNavigation, getPublishedPage, getSiteSettings } from "@/lib/data/site";
import { getInternalPage } from "@/lib/data/internal";
import { getAuthor } from "@/lib/data/authors";
import { localeFromSlug } from "@/lib/i18n";
import { sectionPages, slugToHref } from "@/lib/navigation";
import { slugify } from "@/lib/slug";
import { registerPdfFonts } from "@/lib/pdf/fonts";
import { loadImages } from "@/lib/pdf/images";
import { ArticlePdf, CategoryPdf, type PdfArticle, type PdfMeta } from "@/lib/pdf/document";

/**
 * PDF downloads (/pdf/docs/<slug> and /pdf/kategori/<section id>). Rendering
 * is CPU-heavy, so results are kept in memory (keyed by everything that shows
 * in the file: content version, author, site name, colour, origin) up to
 * CACHE_BYTES, and at most RENDER_CONCURRENCY renders run at once.
 */

export type PdfFile = { data: Buffer; filename: string; internal: boolean };

const CACHE_BYTES = 64 * 1024 * 1024;
/** Part of every cache key: bump when the PDF layout changes, so a running server stops serving old renders. */
const RENDER_VERSION = 3;
const RENDER_CONCURRENCY = 2;
const MAX_WAITING = 8;
const MAX_CATEGORY_PAGES = 80;

const store = globalThis as unknown as { __docskuPdfCache?: Map<string, Buffer>; __docskuPdfRunning?: number; __docskuPdfQueue?: (() => void)[] };
const cache = (store.__docskuPdfCache ??= new Map());
const queue = (store.__docskuPdfQueue ??= []);

function remember(key: string, data: Buffer) {
  cache.delete(key);
  cache.set(key, data);
  let total = 0;
  for (const value of cache.values()) total += value.length;
  for (const [k, value] of cache) {
    if (total <= CACHE_BYTES) break;
    cache.delete(k);
    total -= value.length;
  }
}

function recall(key: string) {
  const hit = cache.get(key);
  if (hit) {
    // Most recently used last.
    cache.delete(key);
    cache.set(key, hit);
  }
  return hit;
}

export class PdfBusyError extends Error {}

/** Runs `task` when a render slot is free; refuses when too many are already waiting. */
async function withSlot<T>(task: () => Promise<T>): Promise<T> {
  if ((store.__docskuPdfRunning ?? 0) >= RENDER_CONCURRENCY) {
    if (queue.length >= MAX_WAITING) throw new PdfBusyError();
    await new Promise<void>((resolve) => queue.push(resolve));
  }
  store.__docskuPdfRunning = (store.__docskuPdfRunning ?? 0) + 1;
  try {
    return await task();
  } finally {
    store.__docskuPdfRunning = (store.__docskuPdfRunning ?? 1) - 1;
    queue.shift()?.();
  }
}

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 32);

async function siteMeta(origin: string, locale: string) {
  const site = await getSiteSettings();
  if (site.pdfDownloads === false) return null;
  const theme = COLOR_THEMES.find((entry) => entry.id === colorThemeOf(site.colorTheme)) ?? COLOR_THEMES[0];
  return { site, meta: { siteName: site.name, locale, accent: theme.light.accent, origin } };
}

type Loaded = NonNullable<Awaited<ReturnType<typeof getPublishedPage>>>;

async function toArticle(page: Loaded, origin: string, showAuthors: boolean): Promise<PdfArticle> {
  const author = showAuthors ? await getAuthor(page.authorId) : null;
  const updated = page.updatedAt ?? page.publishedAt;
  return {
    title: page.title,
    description: page.description,
    content: page.content,
    url: `${origin}${slugToHref(page.slug)}`,
    updatedAt: updated ? new Date(updated).toISOString() : null,
    author: author ? { name: author.name, jobTitle: author.jobTitle } : null,
  };
}

/** Whether PDFs are switched on (the route 404s otherwise). */
export async function pdfEnabled() {
  return (await getSiteSettings()).pdfDownloads !== false;
}

/** One published page; an internal one only for a signed-in team member. Null = 404. */
export async function articlePdf(slug: string, origin: string): Promise<PdfFile | null> {
  const languages = await getLanguageSettings();
  const locale = localeFromSlug(slug, languages);
  const base = await siteMeta(origin, locale);
  if (!base) return null;
  const published = await getPublishedPage(slug);
  const page = published ?? (await getInternalPage(slug));
  if (!page) return null;
  const article = await toArticle(page, origin, base.site.showAuthors !== false);
  const filename = `${slug.split("/").pop() || "halaman"}.pdf`;
  const key = `article:${hash([RENDER_VERSION, slug, article, base.meta, !published])}`;
  const hit = recall(key);
  if (hit) return { data: hit, filename, internal: !published };
  const data = await withSlot(async () => {
    registerPdfFonts();
    const images = await loadImages([page.content]);
    const meta: PdfMeta = { ...base.meta, images };
    return renderToBuffer(<ArticlePdf article={article} meta={meta} />);
  });
  remember(key, data);
  return { data, filename, internal: !published };
}

/** Every page of a navigation section (a category), in sidebar order, in `locale` (null = default language). */
export async function categoryPdf(sectionId: string, locale: string | null, origin: string): Promise<PdfFile | null> {
  const languages = await getLanguageSettings();
  const code = locale && languages.languages.some((language) => language.code === locale) ? locale : null;
  if (locale && !code && locale !== languages.defaultLocale) return null;
  const base = await siteMeta(origin, code ?? languages.defaultLocale);
  if (!base) return null;
  const tabs = await getNavigation(code ?? undefined);
  let found: { title: string; group: string; hrefs: string[] } | null = null;
  for (const tab of tabs) {
    const section = tab.sections.find((entry) => entry.id === sectionId);
    if (section) found = { title: section.title, group: tab.title, hrefs: sectionPages(section).map((link) => link.href) };
  }
  if (!found || !found.hrefs.length) return null;
  const pages = (await Promise.all(found.hrefs.slice(0, MAX_CATEGORY_PAGES).map((href) => getPublishedPage(href.replace(/^\/docs\//, ""))))).filter((page): page is Loaded => !!page);
  if (!pages.length) return null;
  const showAuthors = base.site.showAuthors !== false;
  const articles = await Promise.all(pages.map((page) => toArticle(page, origin, showAuthors)));
  const filename = `${slugify(found.title) || "kategori"}${code ? `-${code}` : ""}.pdf`;
  const key = `category:${hash([RENDER_VERSION, sectionId, code, found.title, found.group, articles, base.meta])}`;
  const hit = recall(key);
  if (hit) return { data: hit, filename, internal: false };
  const { title, group } = found;
  const data = await withSlot(async () => {
    registerPdfFonts();
    const images = await loadImages(pages.map((page) => page.content));
    const meta: PdfMeta = { ...base.meta, images };
    return renderToBuffer(<CategoryPdf title={title} group={group === title ? null : group} articles={articles} meta={meta} />);
  });
  remember(key, data);
  return { data, filename, internal: false };
}
