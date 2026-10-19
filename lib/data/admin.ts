import "server-only";
import { and, asc, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import type { PageStatus } from "@/db/schema";
import { homeTemplate } from "@/lib/content/home-template";

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
  publishedAt: schema.pages.publishedAt,
  updatedAt: schema.pages.updatedAt,
  updatedBy: schema.users.name,
};

export async function listPages({ status, q }: { status?: PageStatus; q?: string } = {}) {
  const filters: SQL[] = [eq(schema.pages.kind, "doc")];
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
    .where(eq(schema.pages.kind, "doc"))
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

export async function listUsers() {
  return db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      role: schema.users.role,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .orderBy(asc(schema.users.createdAt));
}

/** Raw stored settings (uncached), for the settings and navigation editors. */
export async function readSettingForAdmin<T>(key: "site" | "navigation"): Promise<T | undefined> {
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
