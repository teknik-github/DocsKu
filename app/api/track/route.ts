import { connection } from "next/server";
import { z } from "zod";
import { isUncountedVisit, normaliseQuery, readPublicJson, recordRead, recordSearch, recordSearchClick, recordView } from "@/lib/reader";

/**
 * Public beacon from the docs site: a page view, a finished visit (how far down
 * the reader got, seconds visible, whether they left the site from it), a
 * search query and whether it found anything, or the article a search led to.
 */
const bodySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("view"), slug: z.string().min(1).max(200) }),
  z.object({
    type: z.literal("read"),
    slug: z.string().min(1).max(200),
    depth: z.number().int().min(0).max(100),
    seconds: z.number().int().min(0).max(86_400),
    exit: z.boolean(),
  }),
  z.object({ type: z.literal("search"), query: z.string().max(200), found: z.boolean() }),
  z.object({ type: z.literal("search_click"), query: z.string().max(200), slug: z.string().min(1).max(200) }),
]);

export async function POST(request: Request) {
  await connection();
  const body = await readPublicJson(request, bodySchema, "track", { perIp: 60, global: 1200 });
  if ("response" in body) return body.response;
  if (isUncountedVisit(request)) return new Response(null, { status: 204 });

  const data = body.data;
  if (data.type === "view") {
    await recordView(data.slug);
  } else if (data.type === "read") {
    await recordRead(data.slug, data.depth, data.seconds, data.exit);
  } else if (data.type === "search") {
    const query = normaliseQuery(data.query);
    if (query) await recordSearch(query, data.found);
  } else {
    const query = normaliseQuery(data.query);
    if (query) await recordSearchClick(query, data.slug);
  }
  return new Response(null, { status: 204 });
}
