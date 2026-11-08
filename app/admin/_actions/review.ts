"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { logActivity } from "@/lib/activity";
import { authorize } from "@/lib/auth/dal";
import { canEditPage } from "@/lib/auth/page-access";
import { checkExternalLinks } from "@/lib/link-check";
import { dueAtSql, getReviewSettings, REVIEW_INTERVALS, scanLinks } from "@/lib/review";
import type { ReviewSettings } from "@/lib/site-types";

type Result = { ok: true } | { ok: false; error: string };

const idSchema = z.uuid();
const notFound: Result = { ok: false, error: "Halaman tidak ditemukan." };

export type PageReviewInfo = {
  ownerId: string | null;
  authorName: string | null;
  intervalDays: number | null;
  reviewedAt: string | null;
  dueAt: string | null;
  /** Whole days until due (negative: overdue). */
  days: number | null;
  published: boolean;
  settings: ReviewSettings;
  users: { id: string; name: string }[];
};

/** Review state of one page, for the editor's settings panel. */
export async function getPageReview(pageId: string): Promise<PageReviewInfo | null> {
  const user = await authorize("any");
  if ("error" in user || !idSchema.safeParse(pageId).success) return null;
  if (!(await canEditPage(user, pageId))) return null;
  const [rows, users, settings] = await Promise.all([
    db.execute<{ owner_id: string | null; author_name: string | null; review_interval_days: number | null; reviewed_at: Date | string | null; due_at: Date | string | null; days: number | null; status: string }>(sql`
      select p.owner_id, a.name as author_name, p.review_interval_days, p.reviewed_at, p.status::text as status,
        case when p.status = 'published' then ${dueAtSql} end as due_at,
        case when p.status = 'published' then floor(extract(epoch from (${dueAtSql} - now())) / 86400)::int end as days
      from pages p left join users a on a.id = p.author_id
      where p.id = ${pageId} and p.kind = 'doc'`),
    db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).orderBy(schema.users.name),
    getReviewSettings(),
  ]);
  const page = rows[0];
  if (!page) return null;
  const iso = (v: Date | string | null) => (v ? new Date(v).toISOString() : null);
  return {
    ownerId: page.owner_id,
    authorName: page.author_name,
    intervalDays: page.review_interval_days,
    reviewedAt: iso(page.reviewed_at),
    dueAt: iso(page.due_at),
    days: page.days,
    published: page.status === "published",
    settings,
    users,
  };
}

/** Who keeps the page up to date (null: nobody; the author is shown instead). */
export async function setPageOwner(pageId: string, ownerId: string | null): Promise<Result> {
  const user = await authorize();
  if ("error" in user) return { ok: false, error: user.error };
  if (!idSchema.safeParse(pageId).success || (ownerId !== null && !idSchema.safeParse(ownerId).success)) return notFound;
  if (ownerId) {
    const [owner] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, ownerId));
    if (!owner) return { ok: false, error: "Pengguna tidak ditemukan." };
  }
  const updated = await db
    .update(schema.pages)
    .set({ ownerId })
    .where(and(eq(schema.pages.id, pageId), eq(schema.pages.kind, "doc")))
    .returning({ title: schema.pages.draftTitle });
  if (!updated.length) return notFound;
  await logActivity({ user, action: "page.review_settings", target: { type: "page", id: pageId, label: updated[0].title }, meta: { ownerId } });
  return { ok: true };
}

/** null = site default, 0 = never due, otherwise one of REVIEW_INTERVALS. */
export async function setReviewInterval(pageId: string, days: number | null): Promise<Result> {
  const user = await authorize();
  if ("error" in user) return { ok: false, error: user.error };
  if (!idSchema.safeParse(pageId).success) return notFound;
  if (days !== null && days !== 0 && !(REVIEW_INTERVALS as readonly number[]).includes(days)) return { ok: false, error: "Interval tidak valid." };
  const updated = await db
    .update(schema.pages)
    .set({ reviewIntervalDays: days })
    .where(and(eq(schema.pages.id, pageId), eq(schema.pages.kind, "doc")))
    .returning({ title: schema.pages.draftTitle });
  if (!updated.length) return notFound;
  await logActivity({ user, action: "page.review_settings", target: { type: "page", id: pageId, label: updated[0].title }, meta: { intervalDays: days } });
  return { ok: true };
}

/** "Tandai sudah ditinjau": the content was checked and is still current. Published pages only. */
export async function markReviewed(pageIds: string[]): Promise<Result & { reviewedAt?: string }> {
  const user = await authorize();
  if ("error" in user) return { ok: false, error: user.error };
  const parsed = z.array(idSchema).min(1).max(100).safeParse(pageIds);
  if (!parsed.success) return notFound;
  const updated = await db
    .update(schema.pages)
    .set({ reviewedAt: sql`now()` })
    .where(and(inArray(schema.pages.id, parsed.data), eq(schema.pages.kind, "doc"), eq(schema.pages.status, "published")))
    .returning({ id: schema.pages.id, title: schema.pages.draftTitle, reviewedAt: schema.pages.reviewedAt });
  if (!updated.length) return { ok: false, error: "Hanya halaman yang sudah terbit yang bisa ditandai ditinjau." };
  for (const page of updated) await logActivity({ user, action: "page.review", target: { type: "page", id: page.id, label: page.title } });
  return { ok: true, reviewedAt: updated[0].reviewedAt?.toISOString() };
}

const settingsSchema = z.object({ enabled: z.boolean(), defaultIntervalDays: z.number().int().min(0).max(3650) });

/** Pengaturan → Tinjauan konten. Admins only. */
export async function saveReviewSettings(input: ReviewSettings): Promise<Result> {
  const user = await authorize("admin");
  if ("error" in user) return { ok: false, error: user.error };
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pengaturan tinjauan tidak valid." };
  await db
    .insert(schema.settings)
    .values({ key: "review", value: parsed.data })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: parsed.data } });
  await logActivity({ user, action: "settings.save", target: { type: "settings", id: "review", label: "Tinjauan konten" } });
  return { ok: true };
}

/** "Periksa tautan luar": checks external links in published content (oldest checks first). */
export async function runExternalLinkCheck(): Promise<{ ok: true; checked: number; broken: number; remaining: number } | { ok: false; error: string }> {
  const user = await authorize();
  if ("error" in user) return { ok: false, error: user.error };
  const { external } = await scanLinks();
  if (!external.length) return { ok: true, checked: 0, broken: 0, remaining: 0 };
  const last = new Map(external.map((e) => [e.url, e.checkedAt ? Date.parse(e.checkedAt) : 0]));
  const result = await checkExternalLinks(external.map((e) => e.url), last);
  if (result.busy) return { ok: false, error: "Pemeriksaan lain sedang berjalan. Coba lagi sebentar lagi." };
  await logActivity({ user, action: "links.check", meta: { checked: result.checked, broken: result.broken } });
  return { ok: true, checked: result.checked, broken: result.broken, remaining: Math.max(0, Math.min(result.remaining, external.length - result.checked)) };
}
