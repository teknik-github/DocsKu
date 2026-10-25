import "server-only";
import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * Public comments under published doc pages. Visitors and signed-in team
 * members post through /api/comments (lib/reader.ts checks); the dashboard
 * moderates them and comments as the team at /admin/comments. Bodies are plain text: they are rendered as text, never
 * as HTML or Markdown, and links are not made clickable.
 */

export const COMMENT_STATUSES = ["pending", "approved", "spam"] as const;
export type CommentStatus = (typeof COMMENT_STATUSES)[number];
export const MAX_COMMENT = 2000;

/** What visitors see: no email, no status. */
export type PublicComment = { id: string; parentId: string | null; name: string; body: string; staff: boolean; createdAt: string };

/** Published doc page id for a slug, or null. */
async function publishedPageId(slug: string) {
  const [page] = await db
    .select({ id: schema.pages.id })
    .from(schema.pages)
    .where(and(eq(schema.pages.slug, slug), eq(schema.pages.status, "published"), eq(schema.pages.kind, "doc")));
  return page?.id ?? null;
}

/** Approved comments of a published doc page, oldest first; null when the page isn't public. */
export async function listPublicComments(slug: string): Promise<PublicComment[] | null> {
  const pageId = await publishedPageId(slug);
  if (!pageId) return null;
  const c = schema.pageComments;
  const rows = await db
    .select({ id: c.id, parentId: c.parentId, name: c.authorName, body: c.body, staff: c.isStaff, createdAt: c.createdAt })
    .from(c)
    .where(and(eq(c.pageId, pageId), eq(c.status, "approved")))
    .orderBy(asc(c.createdAt))
    .limit(500);
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

/**
 * Stores a comment from the public page: a visitor's, or a signed-in team
 * member's (`staff`, name from their account). A reply must answer an
 * approved top-level comment of the same page. Returns the status, or an error code.
 */
export async function addComment(input: {
  slug: string;
  parentId?: string | null;
  name: string;
  email?: string | null;
  body: string;
  status: CommentStatus;
  staff: boolean;
}): Promise<{ status: CommentStatus } | { error: "page" | "parent" }> {
  const pageId = await publishedPageId(input.slug);
  if (!pageId) return { error: "page" };
  const c = schema.pageComments;
  if (input.parentId) {
    const [parent] = await db
      .select({ id: c.id })
      .from(c)
      .where(and(eq(c.id, input.parentId), eq(c.pageId, pageId), eq(c.status, "approved"), isNull(c.parentId)));
    if (!parent) return { error: "parent" };
  }
  const { status } = input;
  await db.insert(c).values({
    pageId,
    parentId: input.parentId ?? null,
    authorName: input.name,
    authorEmail: input.email || null,
    body: input.body,
    status,
    isStaff: input.staff,
    approvedAt: status === "approved" ? sql`now()` : null,
  });
  return { status };
}

/** A new top-level comment written from the dashboard on a published doc page. */
export async function addStaffComment(pageId: string, name: string, body: string) {
  const [page] = await db
    .select({ id: schema.pages.id })
    .from(schema.pages)
    .where(and(eq(schema.pages.id, pageId), eq(schema.pages.status, "published"), eq(schema.pages.kind, "doc")));
  if (!page) return false;
  await db.insert(schema.pageComments).values({ pageId, authorName: name, body, status: "approved", isStaff: true, approvedAt: sql`now()` });
  return true;
}

/** Published doc pages, for the dashboard's "comment as the team" picker. */
export async function listCommentablePages() {
  return db
    .select({ id: schema.pages.id, title: schema.pages.title, slug: schema.pages.slug })
    .from(schema.pages)
    .where(and(eq(schema.pages.status, "published"), eq(schema.pages.kind, "doc")))
    .orderBy(asc(schema.pages.title));
}

export type AdminComment = {
  id: string;
  parentId: string | null;
  parentName: string | null;
  pageId: string;
  pageTitle: string;
  pageSlug: string;
  pagePublished: boolean;
  name: string;
  email: string | null;
  body: string;
  staff: boolean;
  status: CommentStatus;
  createdAt: string;
  replies: number;
};

/** Comments with a status for the dashboard, newest first, plus counts per status. */
export async function listCommentsForAdmin(status: CommentStatus) {
  const c = schema.pageComments;
  const p = schema.pages;
  const parent = sql`parent`;
  const rows = await db
    .select({
      id: c.id,
      parentId: c.parentId,
      parentName: sql<string | null>`(select author_name from page_comments ${parent} where ${parent}.id = ${c.parentId})`,
      pageId: c.pageId,
      pageTitle: p.title,
      pageSlug: p.slug,
      pagePublished: sql<boolean>`${p.status} = 'published'`,
      name: c.authorName,
      email: c.authorEmail,
      body: c.body,
      staff: c.isStaff,
      status: c.status,
      createdAt: c.createdAt,
      replies: sql<number>`(select count(*)::int from page_comments r where r.parent_id = ${c.id})`,
    })
    .from(c)
    .innerJoin(p, eq(p.id, c.pageId))
    .where(eq(c.status, status))
    .orderBy(desc(c.createdAt))
    .limit(200);
  const counts = await db.select({ status: c.status, n: count() }).from(c).groupBy(c.status);
  const total = Object.fromEntries(COMMENT_STATUSES.map((s) => [s, counts.find((row) => row.status === s)?.n ?? 0])) as Record<CommentStatus, number>;
  return { items: rows.map((row): AdminComment => ({ ...row, createdAt: row.createdAt.toISOString() })), counts: total };
}

export async function setCommentStatus(ids: string[], status: CommentStatus) {
  const c = schema.pageComments;
  await db
    .update(c)
    .set({ status, approvedAt: status === "approved" ? sql`coalesce(${c.approvedAt}, now())` : null })
    .where(inArray(c.id, ids));
}

/** A reply written from the dashboard: approved at once, attached to the top-level comment of the thread. */
export async function addStaffReply(commentId: string, name: string, body: string) {
  const c = schema.pageComments;
  const [target] = await db.select({ id: c.id, parentId: c.parentId, pageId: c.pageId }).from(c).where(eq(c.id, commentId));
  if (!target) return false;
  await db.transaction(async (tx) => {
    // Answering a comment approves it too: the reply would otherwise hang under a hidden comment.
    await tx
      .update(c)
      .set({ status: "approved", approvedAt: sql`coalesce(${c.approvedAt}, now())` })
      .where(inArray(c.id, [target.id, ...(target.parentId ? [target.parentId] : [])]));
    await tx.insert(c).values({
      pageId: target.pageId,
      parentId: target.parentId ?? target.id,
      authorName: name,
      body,
      status: "approved",
      isStaff: true,
      approvedAt: sql`now()`,
    });
  });
  return true;
}

export async function deleteComment(id: string) {
  await db.delete(schema.pageComments).where(eq(schema.pageComments.id, id));
}
