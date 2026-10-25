import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";

/** Reader statistics for the dashboard (/admin/stats). Days are Asia/Jakarta dates, like the counters. */

export const RANGES = [7, 30, 90] as const;
export type Range = (typeof RANGES)[number];
export const FEEDBACK_FILTERS = ["all", "open", "messages"] as const;
export type FeedbackFilter = (typeof FEEDBACK_FILTERS)[number];

const today = sql`(now() at time zone 'Asia/Jakarta')::date`;
/** First day of a range ending today, and of the range before it. */
const since = (days: number) => sql`(${today} - ${days - 1}::int)`;
const before = (days: number) => sql`(${today} - ${2 * days - 1}::int)`;
const feedbackDay = sql`(created_at at time zone 'Asia/Jakarta')::date`;

export type DailyViews = { day: string; views: number };

export async function getStatsOverview(days: Range) {
  const [daily, [totals], [feedback]] = await Promise.all([
    db.execute<DailyViews>(sql`
      select to_char(d, 'YYYY-MM-DD') as day, coalesce(sum(v.views), 0)::int as views
      from generate_series(${since(days)}, ${today}, interval '1 day') d
      left join page_views v on v.day = d::date
      group by d order by d`),
    db.execute<{ views: number; previous: number }>(sql`
      select
        coalesce(sum(views) filter (where day >= ${since(days)}), 0)::int as views,
        coalesce(sum(views) filter (where day < ${since(days)}), 0)::int as previous
      from page_views where day >= ${before(days)}`),
    db.execute<{ helpful: number; unhelpful: number; open: number }>(sql`
      select
        count(*) filter (where helpful and ${feedbackDay} >= ${since(days)})::int as helpful,
        count(*) filter (where not helpful and ${feedbackDay} >= ${since(days)})::int as unhelpful,
        count(*) filter (where not resolved and comment is not null)::int as open
      from page_feedback`),
  ]);
  return { daily: [...daily], views: totals.views, previous: totals.previous, ...feedback };
}

export type PageStat = { id: string; title: string; slug: string; views: number; helpful: number; unhelpful: number };

/** Pages with views or feedback in the range, most viewed first. */
export async function getTopPages(days: Range, limit = 15): Promise<PageStat[]> {
  const rows = await db.execute<PageStat>(sql`
    with v as (select page_id, sum(views)::int as views from page_views where day >= ${since(days)} group by page_id),
    f as (
      select page_id, count(*) filter (where helpful)::int as helpful, count(*) filter (where not helpful)::int as unhelpful
      from page_feedback where ${feedbackDay} >= ${since(days)} group by page_id
    )
    select p.id, p.title, p.slug, coalesce(v.views, 0) as views, coalesce(f.helpful, 0) as helpful, coalesce(f.unhelpful, 0) as unhelpful
    from pages p left join v on v.page_id = p.id left join f on f.page_id = p.id
    where v.page_id is not null or f.page_id is not null
    order by views desc, (coalesce(f.helpful, 0) + coalesce(f.unhelpful, 0)) desc, p.title
    limit ${limit}`);
  return [...rows];
}

export type FeedbackItem = {
  id: string;
  helpful: boolean;
  comment: string | null;
  resolved: boolean;
  createdAt: string;
  pageId: string;
  pageTitle: string;
  pageSlug: string;
};

/** Newest feedback first, regardless of the range, so open items never drop out of view. */
export async function listFeedback(filter: FeedbackFilter, limit = 50): Promise<FeedbackItem[]> {
  const where =
    filter === "open" ? sql`where not f.resolved and f.comment is not null` : filter === "messages" ? sql`where f.comment is not null` : sql``;
  const rows = await db.execute<FeedbackItem>(sql`
    select f.id, f.helpful, f.comment, f.resolved, to_char(f.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt",
      p.id as "pageId", p.title as "pageTitle", p.slug as "pageSlug"
    from page_feedback f join pages p on p.id = f.page_id
    ${where}
    order by f.created_at desc
    limit ${limit}`);
  return [...rows];
}

export type SearchStat = { query: string; searches: number; misses: number };

export async function getSearchStats(days: Range, limit = 12) {
  const grouped = sql`select query, sum(searches)::int as searches, sum(misses)::int as misses from search_queries where day >= ${since(days)} group by query`;
  const [top, misses, [totals]] = await Promise.all([
    db.execute<SearchStat>(sql`${grouped} order by searches desc, query limit ${limit}`),
    db.execute<SearchStat>(sql`${grouped} having sum(misses) > 0 order by misses desc, query limit ${limit}`),
    db.execute<{ searches: number; missed: number }>(sql`
      select coalesce(sum(searches), 0)::int as searches, coalesce(sum(misses), 0)::int as missed from search_queries where day >= ${since(days)}`),
  ]);
  return { top: [...top], misses: [...misses], ...totals };
}
