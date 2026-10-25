import "server-only";
import { sql } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/db";
import { allow } from "@/lib/auth/rate-limit";
import { clientIp, isSameOrigin } from "@/lib/auth/request";

/**
 * Reader statistics written by the public site: page views, "was this
 * helpful?" answers and search queries. Nothing identifies the reader: no
 * cookies are set and no IP address is stored (it is only used, in memory,
 * for rate limiting behind a trusted proxy).
 */

const MAX_BODY = 4096;
const today = sql`(now() at time zone 'Asia/Jakarta')::date`;

/** Crawlers, link previews and headless browsers that should not count as readers. */
const BOT = /bot|crawl|spider|slurp|preview|fetch|monitor|headless|lighthouse|python|curl|wget|httpclient|axios|node-fetch/i;

/** Same-origin check, body size, JSON + schema, and per-IP/global rate limits for a public endpoint. */
export async function readPublicJson<T>(
  request: Request,
  schema: z.ZodType<T>,
  bucket: string,
  limits: { perIp: number; global: number; maxBody?: number },
): Promise<{ data: T } | { response: Response }> {
  const fail = (status: number) => ({ response: new Response(null, { status }) });
  const maxBody = limits.maxBody ?? MAX_BODY;
  if (!isSameOrigin(request)) return fail(403);
  if (Number(request.headers.get("content-length") ?? 0) > maxBody) return fail(413);
  const ip = clientIp(request.headers);
  if (ip && !allow(`${bucket}:ip:${ip}`, limits.perIp, 60_000)) return fail(429);
  if (!allow(`${bucket}:all`, limits.global, 60_000)) return fail(429);
  const text = await request.text();
  if (text.length > maxBody) return fail(413);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return fail(400);
  }
  const parsed = schema.safeParse(json);
  return parsed.success ? { data: parsed.data } : fail(400);
}

/** Visits that shouldn't be counted: bots, and people signed in to the dashboard. */
export function isUncountedVisit(request: Request) {
  const agent = request.headers.get("user-agent") ?? "";
  if (!agent || BOT.test(agent)) return true;
  return /(?:^|;\s*)docsku_session=/.test(request.headers.get("cookie") ?? "");
}

/** Adds a view to today's count for a published doc page. */
export async function recordView(slug: string) {
  await db.execute(sql`
    insert into page_views (page_id, day, views)
    select id, ${today}, 1 from pages where slug = ${slug} and status = 'published' and kind = 'doc'
    on conflict (page_id, day) do update set views = page_views.views + 1`);
}

/** Lower-case, single-spaced query, or null when it is too short or long to be useful. */
export function normaliseQuery(query: string) {
  const q = query.toLowerCase().replace(/\s+/g, " ").trim();
  return q.length >= 2 && q.length <= 100 ? q : null;
}

export async function recordSearch(query: string, found: boolean) {
  await db.execute(sql`
    insert into search_queries (query, day, searches, misses) values (${query}, ${today}, 1, ${found ? 0 : 1})
    on conflict (query, day) do update set
      searches = search_queries.searches + 1,
      misses = search_queries.misses + excluded.misses`);
}

/** Stores a vote for a published doc page; returns its id, which lets the reader add a message. */
export async function recordFeedback(slug: string, helpful: boolean): Promise<string | null> {
  const rows = await db.execute<{ id: string }>(sql`
    insert into page_feedback (page_id, helpful)
    select id, ${helpful} from pages where slug = ${slug} and status = 'published' and kind = 'doc'
    returning id`);
  return rows[0]?.id ?? null;
}

/** Adds the optional message to a vote, once, shortly after it was given. */
export async function attachFeedbackComment(id: string, comment: string) {
  const rows = await db.execute<{ id: string }>(sql`
    update page_feedback set comment = ${comment}
    where id = ${id} and comment is null and created_at > now() - interval '30 minutes'
    returning id`);
  return rows.length > 0;
}
