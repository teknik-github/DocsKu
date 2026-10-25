import { connection } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/dal";
import { allow } from "@/lib/auth/rate-limit";
import { clientIp } from "@/lib/auth/request";
import { addComment, listPublicComments, MAX_COMMENT } from "@/lib/comments";
import { getCommentSettings } from "@/lib/data/site";
import { readPublicJson } from "@/lib/reader";

/**
 * Public comments of a docs page. GET lists the approved ones (the article
 * itself stays prerendered; the comment section fetches this after load) and
 * tells a signed-in team member they comment as themselves. POST adds one:
 * shown at once unless manual moderation is on or it contains links.
 */

const slugSchema = z.string().min(1).max(200);
/** Below this, the form was filled by a script rather than a person. */
const MIN_FILL_MS = 3000;
const MAX_LINKS = 3;
/** New comments per page per 10 minutes, whoever sends them: caps a flood on one page even when no IP is known. */
const PER_PAGE = 10;
const TEN_MINUTES = 10 * 60_000;

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });

export async function GET(request: Request) {
  await connection();
  const slug = slugSchema.safeParse(new URL(request.url).searchParams.get("slug"));
  if (!slug.success) return json({ error: "slug" }, 400);
  const ip = clientIp(request.headers);
  if (ip && !allow(`comments-read:ip:${ip}`, 120, 60_000)) return json({ error: "rate" }, 429);
  if (!allow("comments-read:all", 3000, 60_000)) return json({ error: "rate" }, 429);
  const settings = await getCommentSettings();
  if (!settings.enabled) return json({ enabled: false, comments: [] });
  const [comments, user] = await Promise.all([listPublicComments(slug.data), getCurrentUser()]);
  if (!comments) return json({ error: "page" }, 404);
  return json({ enabled: true, moderation: settings.moderation, viewer: user ? { name: user.name } : null, comments });
}

const bodySchema = z.object({
  slug: slugSchema,
  parentId: z.uuid().nullish(),
  /** Visitors only; a signed-in team member comments under their account name. */
  name: z.string().trim().min(2).max(60).optional(),
  email: z.union([z.literal(""), z.email().max(200)]).nullish(),
  body: z.string().trim().min(2).max(MAX_COMMENT),
  /** Honeypot: hidden from people, filled by naive bots. */
  website: z.string().max(200).optional(),
  /** Milliseconds between showing the form and sending it. */
  elapsed: z.number().int().nonnegative(),
});

export async function POST(request: Request) {
  await connection();
  const settings = await getCommentSettings();
  if (!settings.enabled) return json({ error: "disabled" }, 403);
  const input = await readPublicJson(request, bodySchema, "comments", { perIp: 3, global: 30, maxBody: 12_000 });
  if ("response" in input) return input.response;
  const { website, elapsed, name, email, ...comment } = input.data;
  // Pretend it worked, so the bot learns nothing.
  if (website) return json({ status: "pending" }, 201);

  if (!allow(`comments:page:${comment.slug}`, PER_PAGE, TEN_MINUTES)) return json({ error: "rate" }, 429);

  // The session decides who is staff (readPublicJson already refused other origins).
  const user = await getCurrentUser();
  if (user) {
    const result = await addComment({ ...comment, name: user.name, status: "approved", staff: true });
    return "error" in result ? json({ error: result.error }, 404) : json({ status: result.status }, 201);
  }

  if (!name) return json({ error: "name" }, 400);
  if (elapsed < MIN_FILL_MS) return json({ error: "fast" }, 400);
  // Links need a person's look even without moderation; many links is the shape of spam.
  const links = comment.body.match(/https?:\/\/|www\./gi)?.length ?? 0;
  const status = links > MAX_LINKS ? "spam" : settings.moderation || links > 0 ? "pending" : "approved";
  const result = await addComment({ ...comment, name, email, status, staff: false });
  if ("error" in result) return json({ error: result.error }, 404);
  // A spam verdict is not told to the sender.
  return json({ status: result.status === "spam" ? "pending" : result.status }, 201);
}
