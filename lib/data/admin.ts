import "server-only";
import { can } from "@/lib/auth/permissions";
import { and, asc, count, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { PageStatus, Role } from "@/db/schema";
import { homeTemplate } from "@/lib/content/home-template";
import { dueAtSql } from "@/lib/review";

/**
 * Uncached reads for the dashboard. Callers must check auth first
 * (requireUser / requireAdmin).
 */

const isId = (id: string) => z.uuid().safeParse(id).success;

export async function getPageStats() {
  const rows = await db
    .select({ status: schema.pages.status, total: count() })
    .from(schema.pages)
    .where(eq(schema.pages.kind, "doc"))
    .groupBy(schema.pages.status);
  const stats = { draft: 0, scheduled: 0, published: 0, total: 0 };
  for (const row of rows) {
    stats[row.status] = row.total;
    stats.total += row.total;
  }
  return stats;
}

const pageListColumns = {
  id: schema.pages.id,
  slug: schema.pages.slug,
  title: schema.pages.draftTitle,
  status: schema.pages.status,
  hasChanges: schema.pages.hasChanges,
  navSection: schema.pages.navSection,
  visibility: schema.pages.visibility,
  locale: schema.pages.locale,
  translationOf: schema.pages.translationOf,
  approvalStatus: schema.pages.approvalStatus,
  publishedAt: schema.pages.publishedAt,
  updatedAt: schema.pages.updatedAt,
  updatedBy: schema.users.name,
};

/** Doc pages for the Halaman list; `ownedBy` (contributors) keeps only pages they wrote or own. */
export async function listPages({ status, q, ownedBy }: { status?: PageStatus; q?: string; ownedBy?: string } = {}) {
  const filters: SQL[] = [eq(schema.pages.kind, "doc")];
  if (ownedBy) filters.push(or(eq(schema.pages.authorId, ownedBy), eq(schema.pages.ownerId, ownedBy))!);
  if (status) filters.push(eq(schema.pages.status, status));
  if (q?.trim()) {
    const term = `%${q.trim().replace(/[%_\\]/g, "\\$&")}%`;
    filters.push(or(ilike(schema.pages.draftTitle, term), ilike(schema.pages.slug, term))!);
  }
  return db
    .select(pageListColumns)
    .from(schema.pages)
    .leftJoin(schema.users, eq(schema.pages.updatedById, schema.users.id))
    .where(and(...filters))
    .orderBy(desc(schema.pages.updatedAt))
    .limit(500);
}

export async function listScheduledPages() {
  return db
    .select(pageListColumns)
    .from(schema.pages)
    .leftJoin(schema.users, eq(schema.pages.updatedById, schema.users.id))
    .where(eq(schema.pages.status, "scheduled"))
    .orderBy(asc(schema.pages.publishedAt));
}

export async function getPageForEditor(id: string) {
  if (!isId(id)) return null;
  const [page] = await db.select().from(schema.pages).where(eq(schema.pages.id, id));
  return page ?? null;
}

export async function listRevisions(pageId: string) {
  if (!isId(pageId)) return [];
  return db
    .select({
      id: schema.pageRevisions.id,
      title: schema.pageRevisions.title,
      reason: schema.pageRevisions.reason,
      createdAt: schema.pageRevisions.createdAt,
      author: schema.users.name,
      avatar: schema.users.avatar,
    })
    .from(schema.pageRevisions)
    .leftJoin(schema.users, eq(schema.pageRevisions.createdById, schema.users.id))
    .where(eq(schema.pageRevisions.pageId, pageId))
    .orderBy(desc(schema.pageRevisions.createdAt));
}

/** Minimal list of every page, for pickers (navigation editor, links). */
export async function listPageOptions() {
  return db
    .select({
      id: schema.pages.id,
      slug: schema.pages.slug,
      title: schema.pages.draftTitle,
      status: schema.pages.status,
    })
    .from(schema.pages)
    // Translations take their original's place in navigation; they are never listed themselves.
    .where(and(eq(schema.pages.kind, "doc"), isNull(schema.pages.translationOf)))
    .orderBy(asc(schema.pages.slug));
}

export async function listMedia() {
  return db
    .select({
      id: schema.media.id,
      filename: schema.media.filename,
      originalName: schema.media.originalName,
      size: schema.media.size,
      createdAt: schema.media.createdAt,
      uploadedBy: schema.users.name,
    })
    .from(schema.media)
    .leftJoin(schema.users, eq(schema.media.uploadedById, schema.users.id))
    .orderBy(desc(schema.media.createdAt));
}

/** Users for /admin/users: pages written, last sign-in, and whether a session is still valid. */
export async function listUsers() {
  const rows = await db.execute<{
    id: string;
    name: string;
    email: string;
    role: Role;
    created_at: Date | string;
    pages: number;
    last_login: Date | string | null;
    active: boolean;
    two_factor: boolean;
    avatar: string | null;
    job_title: string | null;
  }>(sql`
    select u.id, u.name, u.email, u.role, u.created_at, (u.totp_enabled_at is not null) as two_factor, u.avatar, u.job_title,
      (select count(*) from pages p where p.author_id = u.id and p.kind = 'doc')::int as pages,
      (select max(s.created_at) from sessions s where s.user_id = u.id) as last_login,
      exists (select 1 from sessions s where s.user_id = u.id and s.expires_at > now()) as active
    from users u
    order by u.created_at`);
  const iso = (value: Date | string) => new Date(value).toISOString();
  return [...rows].map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    createdAt: iso(row.created_at),
    pages: row.pages,
    lastLogin: row.last_login ? iso(row.last_login) : null,
    active: row.active,
    twoFactor: row.two_factor,
    avatar: row.avatar,
    jobTitle: row.job_title,
  }));
}

/** Raw stored settings (uncached), for the settings and navigation editors. */
export async function readSettingForAdmin<T>(key: "site" | "navigation" | "home" | "home_draft" | `home:${string}` | `home_draft:${string}`): Promise<T | undefined> {
  const [row] = await db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, key));
  return row?.value as T | undefined;
}

/**
 * The block-edited home page, created on first use as a draft from the
 * template, so the built-in home stays live until it is published.
 */
export async function ensureHomePage(userId: string, siteName: string) {
  const [existing] = await db.select({ id: schema.pages.id }).from(schema.pages).where(eq(schema.pages.kind, "home"));
  if (existing) return existing.id;
  const content = homeTemplate(siteName);
  await db
    .insert(schema.pages)
    .values({
      kind: "home",
      slug: "_home",
      title: "Beranda",
      draftTitle: "Beranda",
      content,
      draftContent: content,
      authorId: userId,
      updatedById: userId,
    })
    .onConflictDoNothing();
  const [home] = await db.select({ id: schema.pages.id }).from(schema.pages).where(eq(schema.pages.kind, "home"));
  return home.id;
}

/** Badges in the dashboard sidebar: things waiting for someone. One small query per page load. */
/**
 * Sidebar badges. Staff: the queues they handle (pending comments, reader
 * messages, drafts, overdue reviews, pages waiting for approval). A contributor:
 * only their own drafts and pages sent back with changes requested.
 */
export async function getNavCounts(user?: { id: string; role: Role }) {
  if (user && !can(user, "pages.editAny")) {
    const [own] = await db.execute<{ drafts: number; changes: number }>(sql`
      select
        (select count(*) from pages where kind = 'doc' and (author_id = ${user.id} or owner_id = ${user.id}) and (status = 'draft' or has_changes))::int as drafts,
        (select count(*) from pages where kind = 'doc' and (author_id = ${user.id} or owner_id = ${user.id} or approval_requested_by_id = ${user.id}) and approval_status = 'changes_requested')::int as changes`);
    return { comments: 0, feedback: 0, review: 0, approvals: 0, drafts: own?.drafts ?? 0, changes: own?.changes ?? 0 };
  }
  const [row] = await db.execute<{ comments: number; feedback: number; drafts: number; review: number; approvals: number }>(sql`
    select
      (select count(*) from pages p where p.kind = 'doc' and p.status = 'published' and ${dueAtSql} < now())::int as review,
      (select count(*) from page_comments where status = 'pending')::int as comments,
      (select count(*) from page_feedback where not resolved and comment is not null)::int as feedback,
      (select count(*) from pages where kind = 'doc' and (status = 'draft' or has_changes))::int as drafts,
      (select count(*) from pages where kind = 'doc' and approval_status = 'pending')::int as approvals`);
  return { ...(row ?? { comments: 0, feedback: 0, drafts: 0, review: 0, approvals: 0 }), changes: 0 };
}
