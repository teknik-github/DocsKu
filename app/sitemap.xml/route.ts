import { getDiscoveryPages, getTranslatedPages } from "@/lib/data/discovery";
import { getHomeAlternates, getLanguageSettings, getSiteSettings, getTranslationAlternates } from "@/lib/data/site";
import { getAuthorUsernames } from "@/lib/data/authors";
import { authorHref } from "@/lib/authors";
import { publicOrigin } from "@/lib/auth/request";
import { absolute, textResponse } from "@/lib/discovery-http";
import type { Alternates } from "@/lib/i18n";

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Home (and each language's own home, /<code>), the docs hubs and every public, indexable doc page, with each
 * translation as its own URL and `xhtml:link` alternates between the versions,
 * plus author pages (/penulis/…) when Tema → Penulis is on.
 */
export async function GET(request: Request) {
  const origin = publicOrigin(request);
  const [pages, translated, alternates, languages, site, authors, homes] = await Promise.all([
    getDiscoveryPages(),
    getTranslatedPages(),
    getTranslationAlternates(),
    getLanguageSettings(),
    getSiteSettings(),
    getAuthorUsernames(),
    getHomeAlternates(),
  ]);
  // Homes of other languages ("/en") that have their own published sections.
  const homeVersions: Alternates | undefined = Object.keys(homes).length ? homes : undefined;
  const newest = pages.reduce((max, p) => (p.lastModified > max ? p.lastModified : max), "");
  const hubs: Alternates | undefined = languages.languages.length
    ? Object.fromEntries([[languages.defaultLocale, "/docs"], ...languages.languages.map((l) => [l.code, `/docs/${l.code}`])])
    : undefined;
  const urls: { path: string; lastmod: string; versions?: Alternates }[] = [
    { path: "/", lastmod: newest, versions: homeVersions },
    ...Object.entries(homes)
      .filter(([code]) => code !== languages.defaultLocale)
      .map(([, href]) => ({ path: href, lastmod: newest, versions: homeVersions })),
    { path: "/docs", lastmod: newest, versions: hubs },
    ...languages.languages.map((l) => ({ path: `/docs/${l.code}`, lastmod: newest, versions: hubs })),
    ...pages.map((p) => ({ path: p.href, lastmod: p.lastModified, versions: alternates[p.href] })),
    ...translated.map((p) => ({ path: p.href, lastmod: p.lastModified, versions: alternates[p.href] })),
    ...(site.showAuthors === false ? [] : authors.map((username) => ({ path: authorHref(username), lastmod: "" }))),
  ];
  const link = (versions: Alternates | undefined) =>
    versions
      ? [
          ...Object.entries(versions).map(([code, href]) => `<xhtml:link rel="alternate" hreflang="${xml(code)}" href="${xml(absolute(origin, href))}"/>`),
          `<xhtml:link rel="alternate" hreflang="x-default" href="${xml(absolute(origin, versions[languages.defaultLocale] ?? "/docs"))}"/>`,
        ].join("")
      : "";
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls.map((u) => `  <url><loc>${xml(absolute(origin, u.path))}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}${link(u.versions)}</url>`),
    "</urlset>",
    "",
  ].join("\n");
  return textResponse(body, "application/xml");
}
