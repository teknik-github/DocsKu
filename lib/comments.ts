import "server-only";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
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
    .where(and(eq(schema.pages.slug, slug), eq(schema.pages.status, "published"), eq(schema.pages.kind, "doc"), eq(schema.pages.visibility, "public")));
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
}): Promise<{ status: CommentStatus; id: string; pageId: string } | { error: "page" | "parent" }> {
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
  const [row] = await db
    .insert(c)
    .values({
      pageId,
      parentId: input.parentId ?? null,
      authorName: input.name,
      authorEmail: input.email || null,
      body: input.body,
      status,
      isStaff: input.staff,
      approvedAt: status === "approved" ? sql`now()` : null,
    })
    .returning({ id: c.id });
  return { status, id: row.id, pageId };
}

/** A new top-level comment written from the dashboard on a published doc page. */
export async function addStaffComment(pageId: string, name: string, body: string) {
  const [page] = await db
    .select({ id: schema.pages.id })
    .from(schema.pages)
    .where(and(eq(schema.pages.id, pageId), eq(schema.pages.status, "published"), eq(schema.pages.kind, "doc"), eq(schema.pages.visibility, "public")));
  if (!page) return false;
  await db.insert(schema.pageComments).values({ pageId, authorName: name, body, status: "approved", isStaff: true, approvedAt: sql`now()` });
  return true;
}

/** Published doc pages, for the dashboard's "comment as the team" picker. */
export async function listCommentablePages() {
  return db
    .select({ id: schema.pages.id, title: schema.pages.title, slug: schema.pages.slug })
    .from(schema.pages)
    .where(and(eq(schema.pages.status, "published"), eq(schema.pages.kind, "doc"), eq(schema.pages.visibility, "public")))
    .orderBy(asc(schema.pages.title));
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

export async function deleteComments(ids: string[]) {
  await db.delete(schema.pageComments).where(inArray(schema.pageComments.id, ids));
}

/**
 * The Komentar list (WordPress-style): "all" (not spam), "unanswered" (the
 * newest message of each conversation whose last word is a visitor's),
 * or one status.
 */
export const COMMENT_VIEWS = ["all", "unanswered", "pending", "approved", "spam"] as const;
export type CommentView = (typeof COMMENT_VIEWS)[number];
export const COMMENTS_PER_PAGE = 20;

export type CommentRow = {
  id: string;
  parentId: string | null;
  /** The comment this one answers, for "Membalas …" and the AI draft's context. */
  parentName: string | null;
  parentBody: string | null;
  pageId: string;
  pageTitle: string;
  pageSlug: string;
  pagePublished: boolean;
  /** Approved comments on that page (the count bubble). */
  pageComments: number;
  name: string;
  email: string | null;
  body: string;
  staff: boolean;
  status: CommentStatus;
  createdAt: string;
};

export async function listCommentRows({ view, pageId, query, page }: { view: CommentView; pageId?: string; query?: string; page: number }) {
  const term = query?.trim() ? `%${query.trim().replace(/[%_\\]/g, "\\$&")}%` : null;
  const rows = await db.execute<{
    id: string;
    parent_id: string | null;
    parent_name: string | null;
    parent_body: string | null;
    page_id: string;
    page_title: string;
    page_slug: string;
    page_published: boolean;
    page_comments: number;
    author_name: string;
    author_email: string | null;
    body: string;
    is_staff: boolean;
    status: CommentStatus;
    created_at: Date | string;
    total: number;
  }>(sql`
    with t as (select c.*, coalesce(c.parent_id, c.id) as root from page_comments c),
    latest as (select distinct on (root) root, id, is_staff from t where status <> 'spam' order by root, created_at desc)
    select t.id, t.parent_id, par.author_name as parent_name, par.body as parent_body,
      t.page_id, p.title as page_title, p.slug as page_slug, (p.status = 'published') as page_published,
      (select count(*) from page_comments x where x.page_id = t.page_id and x.status = 'approved')::int as page_comments,
      t.author_name, t.author_email, t.body, t.is_staff, t.status, t.created_at,
      (count(*) over ())::int as total
    from t
    join pages p on p.id = t.page_id
    left join page_comments par on par.id = t.parent_id
    where ${
      view === "all"
        ? sql`t.status <> 'spam'`
        : view === "unanswered"
          ? sql`t.id in (select id from latest where not is_staff)`
          : sql`t.status = ${view}`
    }
      ${pageId ? sql`and t.page_id = ${pageId}` : sql``}
      ${term ? sql`and (t.body ilike ${term} or t.author_name ilike ${term} or t.author_email ilike ${term})` : sql``}
    order by t.created_at desc
    limit ${COMMENTS_PER_PAGE} offset ${(page - 1) * COMMENTS_PER_PAGE}`);

  const [counts] = await db.execute<Record<CommentView, number>>(sql`
    with t as (select c.*, coalesce(c.parent_id, c.id) as root from page_comments c),
    latest as (select distinct on (root) root, is_staff from t where status <> 'spam' order by root, created_at desc)
    select
      (select count(*) from page_comments where status <> 'spam')::int as all,
      (select count(*) from latest where not is_staff)::int as unanswered,
      (select count(*) from page_comments where status = 'pending')::int as pending,
      (select count(*) from page_comments where status = 'approved')::int as approved,
      (select count(*) from page_comments where status = 'spam')::int as spam`);

  const pages = await db.execute<{ id: string; title: string; n: number }>(sql`
    select p.id, p.title, count(*)::int as n from page_comments c join pages p on p.id = c.page_id
    group by p.id, p.title order by p.title`);

  return {
    rows: [...rows].map(
      (r): CommentRow => ({
        id: r.id,
        parentId: r.parent_id,
        parentName: r.parent_name,
        parentBody: r.parent_body,
        pageId: r.page_id,
        pageTitle: r.page_title,
        pageSlug: r.page_slug,
        pagePublished: r.page_published,
        pageComments: r.page_comments,
        name: r.author_name,
        email: r.author_email,
        body: r.body,
        staff: r.is_staff,
        status: r.status,
        createdAt: new Date(r.created_at).toISOString(),
      }),
    ),
    total: rows[0]?.total ?? 0,
    counts: counts ?? { all: 0, unanswered: 0, pending: 0, approved: 0, spam: 0 },
    pages: [...pages],
  };
}
