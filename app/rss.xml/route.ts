import { getChangelog } from "@/lib/data/changelog";
import { getLanguageSettings, getSiteSettings } from "@/lib/data/site";
import { publicOrigin } from "@/lib/auth/request";
import { absolute, textResponse } from "@/lib/discovery-http";
import { t } from "@/lib/i18n";

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** RSS 2.0 feed of "Apa yang baru" (/terbaru): newly published and updated public articles. */
export async function GET(request: Request) {
  const origin = publicOrigin(request);
  const [entries, site, languages] = await Promise.all([getChangelog(), getSiteSettings(), getLanguageSettings()]);
  const locale = languages.defaultLocale;
  const showAuthors = site.showAuthors !== false;
  const items = entries.map((entry) => {
    const link = absolute(origin, entry.href);
    const label = t(locale, entry.kind === "new" ? "newBadge" : "updatedBadge");
    return [
      "    <item>",
      `      <title>${xml(entry.kind === "new" ? entry.title : `${entry.title} (${label})`)}</title>`,
      `      <link>${xml(link)}</link>`,
      // A new guid per publish, so feed readers show an update as a new item.
      `      <guid isPermaLink="false">${xml(`${link}#${entry.date}`)}</guid>`,
      `      <pubDate>${new Date(entry.date).toUTCString()}</pubDate>`,
      entry.group ? `      <category>${xml(entry.group)}</category>` : "",
      showAuthors && entry.author ? `      <dc:creator>${xml(entry.author)}</dc:creator>` : "",
      entry.description ? `      <description>${xml(entry.description)}</description>` : "",
      "    </item>",
    ]
      .filter(Boolean)
      .join("\n");
  });
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">',
    "  <channel>",
    `    <title>${xml(`${site.name} Docs — ${t(locale, "whatsNew")}`)}</title>`,
    `    <link>${xml(absolute(origin, "/terbaru"))}</link>`,
    `    <description>${xml(site.description || t(locale, "whatsNewIntro"))}</description>`,
    `    <language>${xml(locale)}</language>`,
    `    <atom:link href="${xml(absolute(origin, "/rss.xml"))}" rel="self" type="application/rss+xml"/>`,
    entries[0] ? `    <lastBuildDate>${new Date(entries[0].date).toUTCString()}</lastBuildDate>` : "",
    ...items,
    "  </channel>",
    "</rss>",
    "",
  ]
    .filter(Boolean)
    .join("\n");
  return textResponse(body, "application/rss+xml");
}
