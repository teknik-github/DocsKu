import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { and, eq } from "drizzle-orm";
import { buildingWithoutDatabase, db, schema } from "@/db";
import { toMarkdown } from "@/lib/content/markdown";
import { allPages, slugToHref } from "@/lib/navigation";
import { getLanguageSettings, getNavigation, getSiteSettings } from "@/lib/data/site";

/**
 * What crawlers and AI tools read: /sitemap.xml, /robots.txt, /llms.txt and
 * /llms-full.txt. Only public, published doc pages; pages marked noindex are
 * left out. Pages follow the navigation order, then any published page not
 * listed there (still reachable by URL) under "Lainnya".
 */
export type DiscoveryPage = {
  href: string;
  title: string;
  description: string;
  /** "Tab › Bagian", or "Lainnya" for pages outside the navigation. */
  group: string;
  lastModified: string;
};

async function publicRows() {
  return db
    .select({
      slug: schema.pages.slug,
      title: schema.pages.title,
      description: schema.pages.description,
      content: schema.pages.content,
      seo: schema.pages.seo,
      publishedAt: schema.pages.publishedAt,
      updatedAt: schema.pages.updatedAt,
      locale: schema.pages.locale,
      translationOf: schema.pages.translationOf,
    })
    .from(schema.pages)
    .where(and(eq(schema.pages.status, "published"), eq(schema.pages.kind, "doc"), eq(schema.pages.visibility, "public")));
}

type Row = Awaited<ReturnType<typeof publicRows>>[number];

async function orderedRows(): Promise<{ row: Row; title: string; group: string }[]> {
  const [tabs, rows] = await Promise.all([getNavigation(), publicRows()]);
  const bySlug = new Map(rows.filter((row) => !row.seo?.noindex).map((row) => [slugToHref(row.slug), row]));
  const listed = allPages(tabs).flatMap((page) => {
    const row = bySlug.get(page.href);
    if (!row) return [];
    bySlug.delete(page.href);
    return [{ row, title: page.title, group: page.tab === page.section ? page.tab : `${page.tab} › ${page.section}` }];
  });
  // Translations are listed per language (getTranslatedPages), not here.
  const rest = [...bySlug.values()]
    .filter((row) => !row.translationOf)
    .sort((a, b) => a.title.localeCompare(b.title, "id"))
    .map((row) => ({ row, title: row.title, group: "Lainnya" }));
  return [...listed, ...rest];
}

export async function getDiscoveryPages(): Promise<DiscoveryPage[]> {
  "use cache";
  cacheTag("pages", "navigation");
  cacheLife("max");
  if (buildingWithoutDatabase) return [];
  return (await orderedRows()).map(({ row, title, group }) => ({
    href: slugToHref(row.slug),
    title,
    description: row.seo?.description || row.description,
    group,
    lastModified: (row.updatedAt > (row.publishedAt ?? row.updatedAt) ? row.updatedAt : (row.publishedAt ?? row.updatedAt)).toISOString(),
  }));
}

/** Every public page as Markdown in one file (/llms-full.txt), with relative links. */
export async function getFullMarkdown(): Promise<{ name: string; description: string; pages: { href: string; title: string; markdown: string }[] }> {
  "use cache";
  cacheTag("pages", "navigation", "settings");
  cacheLife("max");
  const site = await getSiteSettings();
  if (buildingWithoutDatabase) return { name: site.name, description: site.description, pages: [] };
  const rows = await orderedRows();
  return {
    name: site.name,
    description: site.description,
    pages: rows.map(({ row, title }) => ({ href: slugToHref(row.slug), title, markdown: toMarkdown(row.content) })),
  };
}

/** Published public translations in the enabled extra languages (for the sitemap), indexable ones only. */
export async function getTranslatedPages(): Promise<{ href: string; locale: string; lastModified: string }[]> {
  "use cache";
  cacheTag("pages", "settings");
  cacheLife("max");
  if (buildingWithoutDatabase) return [];
  const [rows, languages] = await Promise.all([publicRows(), getLanguageSettings()]);
  const enabled = new Set(languages.languages.map((language) => language.code));
  return rows
    .filter((row) => row.translationOf && enabled.has(row.locale) && !row.seo?.noindex)
    .map((row) => ({ href: slugToHref(row.slug), locale: row.locale, lastModified: (row.updatedAt > (row.publishedAt ?? row.updatedAt) ? row.updatedAt : (row.publishedAt ?? row.updatedAt)).toISOString() }));
}
