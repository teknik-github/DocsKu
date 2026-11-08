import { connection } from "next/server";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { JSONContent } from "@tiptap/core";
import { db, schema } from "@/db";
import { getCommentSettings } from "@/lib/data/site";
import { notify } from "@/lib/notify";
import { isUncountedVisit, readPublicJson } from "@/lib/reader";

/**
 * A reader marks a passage of a published article as confusing. It becomes an
 * internal note on that page (source "reader", no author) for the team, with
 * the passage as its quote; the same passage marked again (while that note is
 * open) is added as a reply instead of a new note. Nothing about the reader is
 * stored. Off with Pengaturan → Komentar → "Pembaca bisa menandai bagian".
 */

const DEFAULT_BODY = "Pembaca menandai bagian ini membingungkan.";
const AGAIN_BODY = "Pembaca lain juga menandai bagian ini.";
/** At most this many reader notes and replies per page per 10 minutes. */
const PER_PAGE = 15;

const bodySchema = z.object({
  slug: z.string().min(1).max(200),
  quote: z.string().trim().min(3).max(300),
  message: z.string().trim().max(500).default(""),
  /** Honeypot: people never fill it. */
  website: z.string().max(200).optional(),
});

export async function POST(request: Request) {
  await connection();
  const body = await readPublicJson(request, bodySchema, "section-feedback", { perIp: 5, global: 60 });
  if ("response" in body) return body.response;
  const { slug, message, website } = body.data;
  const quote = body.data.quote.replace(/\s+/g, " ");
  const settings = await getCommentSettings();
  if (settings.sectionFeedback === false) return Response.json({ error: "Fitur ini sedang dimatikan." }, { status: 403 });
  // Bots and filled honeypots get a quiet "ok" and nothing is stored.
  if (website || isUncountedVisit(request)) return new Response(null, { status: 204 });

  const [page] = await db
    .select({ id: schema.pages.id, title: schema.pages.title, content: schema.pages.content })
    .from(schema.pages)
    .where(and(eq(schema.pages.slug, slug), eq(schema.pages.status, "published"), eq(schema.pages.kind, "doc"), eq(schema.pages.visibility, "public")));
  if (!page) return Response.json({ error: "Halaman tidak ditemukan." }, { status: 404 });
  // Only passages that are really on the page (no notes with made-up text).
  const flat = (node: JSONContent): string => (node.type === "text" ? (node.text ?? "") : (node.content ?? []).map(flat).join(" "));
  const pageText = flat(page.content).replace(/\s+/g, " ");
  if (!pageText.includes(quote.slice(0, 120))) return Response.json({ error: "Bagian itu tidak ada di halaman." }, { status: 400 });

  const [recent] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.pageNotes)
    .where(and(eq(schema.pageNotes.pageId, page.id), eq(schema.pageNotes.source, "reader"), gt(schema.pageNotes.createdAt, sql`now() - interval '10 minutes'`)));
  if ((recent?.n ?? 0) >= PER_PAGE) return Response.json({ error: "Terlalu banyak tanda untuk halaman ini. Coba lagi nanti." }, { status: 429 });

  const [open] = await db
    .select({ id: schema.pageNotes.id })
    .from(schema.pageNotes)
    .where(and(eq(schema.pageNotes.pageId, page.id), isNull(schema.pageNotes.parentId), isNull(schema.pageNotes.resolvedAt), eq(schema.pageNotes.source, "reader"), eq(schema.pageNotes.quote, quote)));
  const text = message || (open ? AGAIN_BODY : DEFAULT_BODY);
  const [row] = await db
    .insert(schema.pageNotes)
    .values({ pageId: page.id, parentId: open?.id ?? null, authorId: null, source: "reader", quote: open ? "" : quote, body: text })
    .returning({ id: schema.pageNotes.id });

  // Email the team about a page at most once an hour, and not for a repeat of an open passage.
  if (open) return Response.json({ ok: true });
  const [lately] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.pageNotes)
    .where(and(eq(schema.pageNotes.pageId, page.id), eq(schema.pageNotes.source, "reader"), gt(schema.pageNotes.createdAt, sql`now() - interval '1 hour'`)));
  // This note is one of them; any other means the team was already told within the hour.
  if ((lately?.n ?? 0) > 1) return Response.json({ ok: true });
  await notify({
    type: "note.new",
    noteId: row.id,
    pageId: page.id,
    pageTitle: page.title,
    by: "Pembaca",
    excerpt: text,
    quote,
    reply: false,
    participants: [],
  });
  return Response.json({ ok: true });
}
