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

/** What the dashboard's Komentar tabs show: threads awaiting a team reply, or threads holding comments of one status. */
export const COMMENT_VIEWS = ["unanswered", "pending", "approved", "spam"] as const;
export type CommentView = (typeof COMMENT_VIEWS)[number];

export type ThreadMessage = {
  id: string;
  parentId: string | null;
  name: string;
  email: string | null;
  body: string;
  staff: boolean;
  status: CommentStatus;
  createdAt: string;
};
export type CommentThread = {
  id: string;
  pageId: string;
  pageTitle: string;
  pageSlug: string;
  pagePublished: boolean;
  lastAt: string;
  messages: ThreadMessage[];
};

/**
 * Whole conversations (a top-level comment and its replies) for the dashboard,
 * latest activity first. "unanswered": the newest non-spam message is a
 * visitor's. Otherwise: threads holding a comment with that status. Spam
 * messages only appear in the spam tab.
 */
export async function listThreadsForAdmin(view: CommentView) {
  const rows = await db.execute<{
    id: string;
    parent_id: string | null;
    root: string;
    page_id: string;
    page_title: string;
    page_slug: string;
    page_published: boolean;
    author_name: string;
    author_email: string | null;
    body: string;
    is_staff: boolean;
    status: CommentStatus;
    created_at: Date | string;
  }>(sql`
    with t as (select c.*, coalesce(c.parent_id, c.id) as root from page_comments c),
    latest as (
      select distinct on (root) root, is_staff from t where status <> 'spam' order by root, created_at desc
    ),
    roots as (
      select t.root, max(t.created_at) as last_at from t
      where ${
        view === "unanswered"
          ? sql`t.status <> 'spam' and t.root in (select root from latest where not is_staff)`
          : sql`t.root in (select root from t where status = ${view})`
      }
      group by t.root order by last_at desc limit 100
    )
    select t.id, t.parent_id, t.root, t.page_id, p.title as page_title, p.slug as page_slug, (p.status = 'published') as page_published,
      t.author_name, t.author_email, t.body, t.is_staff, t.status, t.created_at
    from t join roots r on r.root = t.root join pages p on p.id = t.page_id
    where ${view === "spam" ? sql`true` : sql`t.status <> 'spam'`}
    order by r.last_at desc, t.created_at asc`);

  const threads = new Map<string, CommentThread>();
  for (const row of rows) {
    const createdAt = new Date(row.created_at).toISOString();
    let thread = threads.get(row.root);
    if (!thread) {
      thread = { id: row.root, pageId: row.page_id, pageTitle: row.page_title, pageSlug: row.page_slug, pagePublished: row.page_published, lastAt: createdAt, messages: [] };
      threads.set(row.root, thread);
    }
    if (createdAt > thread.lastAt) thread.lastAt = createdAt;
    thread.messages.push({ id: row.id, parentId: row.parent_id, name: row.author_name, email: row.author_email, body: row.body, staff: row.is_staff, status: row.status, createdAt });
  }

  const [counts] = await db.execute<Record<CommentView, number>>(sql`
    with t as (select c.*, coalesce(c.parent_id, c.id) as root from page_comments c),
    latest as (select distinct on (root) root, is_staff from t where status <> 'spam' order by root, created_at desc)
    select
      (select count(*) from latest where not is_staff)::int as unanswered,
      (select count(*) from page_comments where status = 'pending')::int as pending,
      (select count(*) from page_comments where status = 'approved')::int as approved,
      (select count(*) from page_comments where status = 'spam')::int as spam`);
  return { threads: [...threads.values()], counts: counts ?? { unanswered: 0, pending: 0, approved: 0, spam: 0 } };
}
