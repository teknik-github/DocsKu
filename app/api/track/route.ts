import { connection } from "next/server";
import { z } from "zod";
import { isUncountedVisit, normaliseQuery, readPublicJson, recordSearch, recordView } from "@/lib/reader";

/** Public beacon from the docs site: a page view, or a search query and whether it found anything. */
const bodySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("view"), slug: z.string().min(1).max(200) }),
  z.object({ type: z.literal("search"), query: z.string().max(200), found: z.boolean() }),
]);

export async function POST(request: Request) {
  await connection();
  const body = await readPublicJson(request, bodySchema, "track", { perIp: 60, global: 1200 });
  if ("response" in body) return body.response;
  if (isUncountedVisit(request)) return new Response(null, { status: 204 });

  if (body.data.type === "view") {
    await recordView(body.data.slug);
  } else {
    const query = normaliseQuery(body.data.query);
    if (query) await recordSearch(query, body.data.found);
  }
  return new Response(null, { status: 204 });
}
