import { connection } from "next/server";
import { z } from "zod";
import { attachFeedbackComment, readPublicJson, recordFeedback } from "@/lib/reader";

/**
 * "Was this page helpful?" from the docs site. A vote returns an id; the
 * reader may then send one message for it, which only the dashboard shows.
 */
const bodySchema = z.union([
  z.object({ slug: z.string().min(1).max(200), helpful: z.boolean() }),
  z.object({ id: z.uuid(), comment: z.string().trim().min(1).max(1000) }),
]);

export async function POST(request: Request) {
  await connection();
  const body = await readPublicJson(request, bodySchema, "feedback", { perIp: 10, global: 120 });
  if ("response" in body) return body.response;

  if ("slug" in body.data) {
    const id = await recordFeedback(body.data.slug, body.data.helpful);
    return id ? Response.json({ id }) : new Response(null, { status: 404 });
  }
  const saved = await attachFeedbackComment(body.data.id, body.data.comment);
  return new Response(null, { status: saved ? 204 : 404 });
}
