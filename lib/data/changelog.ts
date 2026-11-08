import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { sql } from "drizzle-orm";
import { buildingWithoutDatabase, db } from "@/db";
import { allPages, slugToHref } from "@/lib/navigation";
import { getNavigation } from "@/lib/data/site";

/**
 * "Apa yang baru" (/terbaru) and its feed (/rss.xml): public published doc
 * pages in the default language, newest publish first. A page counts as
 * "updated" when it was published again later than its first publish; the
 * date shown is that last publish (its newest "publish" revision).
 */
export type ChangelogEntry = {
  href: string;
  title: string;
  description: string;
  /** "Tab › Bagian" from the navigation, or "" when the page isn't listed. */
  group: string;
  kind: "new" | "updated";
  /** ISO time of the last publish. */
  date: string;
  /** ISO time of the first publish. */
  publishedAt: string;
  author: string | null;
};

const LIMIT = 50;
/** A republish within this long of the first one is still part of "new" (fixing a typo right after publishing). */
const SAME_RELEASE_MS = 60 * 60 * 1000;

export async function getChangelog(): Promise<ChangelogEntry[]> {
  "use cache";
  cacheTag("pages", "navigation", "authors");
  cacheLife("max");
  if (buildingWithoutDatabase) return [];
  const [tabs, rows] = await Promise.all([
    getNavigation(),
    db.execute<{ slug: string; title: string; description: string; published_at: Date; last_published: Date; author: string | null; noindex: boolean }>(sql`
      select p.slug, p.title, coalesce(nullif(p.seo->>'description', ''), p.description) as description, p.published_at,
        greatest(p.published_at, coalesce((select max(r.created_at) from page_revisions r where r.page_id = p.id and r.reason = 'publish'), p.published_at)) as last_published,
        u.name as author, coalesce((p.seo->>'noindex')::boolean, false) as noindex
      from pages p
      left join users u on u.id = coalesce(p.author_id, p.updated_by_id)
      where p.status = 'published' and p.kind = 'doc' and p.visibility = 'public' and p.translation_of is null and p.published_at is not null
      order by last_published desc
      limit ${LIMIT}`),
  ]);
  const groups = new Map(allPages(tabs).map((page) => [page.href, page.tab === page.section ? page.tab : `${page.tab} › ${page.section}`]));
  return rows
    .filter((row) => !row.noindex)
    .map((row) => {
      const publishedAt = new Date(row.published_at);
      const last = new Date(row.last_published);
      const href = slugToHref(row.slug);
      return {
        href,
        title: row.title,
        description: row.description,
        group: groups.get(href) ?? "",
        kind: last.getTime() - publishedAt.getTime() > SAME_RELEASE_MS ? "updated" : "new",
        date: last.toISOString(),
        publishedAt: publishedAt.toISOString(),
        author: row.author,
      };
    });
}
