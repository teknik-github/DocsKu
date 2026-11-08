"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { authorize } from "@/lib/auth/dal";
import { logActivity, pageLabel } from "@/lib/activity";
import { eq } from "drizzle-orm";
import { addStaffComment, addStaffReply, COMMENT_STATUSES, deleteComment as removeComment, deleteComments as removeComments, MAX_COMMENT, setCommentStatus } from "@/lib/comments";
import type { CommentSettings } from "@/lib/site-types";

type Result = { ok: true } | { ok: false; error: string };

const idSchema = z.uuid();

/** "Sari: Bagaimana cara…" for the log. */
async function commentLabel(id: string) {
  const [row] = await db.select({ name: schema.pageComments.authorName, body: schema.pageComments.body }).from(schema.pageComments).where(eq(schema.pageComments.id, id));
  return row ? `${row.name}: ${row.body.replace(/\s+/g, " ").slice(0, 80)}` : null;
}
const notFound: Result = { ok: false, error: "Komentar tidak ditemukan." };

/** Approve, mark as spam, or send back to the queue. Editors and admins. */
export async function moderateComment(id: string, status: (typeof COMMENT_STATUSES)[number]): Promise<Result> {
  const user = await authorize();
  if ("error" in user) return { ok: false, error: user.error };
  if (!idSchema.safeParse(id).success || !COMMENT_STATUSES.includes(status)) return notFound;
  await setCommentStatus([id], status);
  await logActivity({ user, action: "comment.moderate", target: { type: "comment", id, label: await commentLabel(id) }, meta: { status, count: 1 } });
  return { ok: true };
}

/** Deletes a comment and its replies. */
export async function deleteComment(id: string): Promise<Result> {
  const user = await authorize();
  if ("error" in user) return { ok: false, error: user.error };
  if (!idSchema.safeParse(id).success) return notFound;
  const label = await commentLabel(id);
  await removeComment(id);
  await logActivity({ user, action: "comment.delete", target: { type: "comment", id, label }, meta: { count: 1 } });
  return { ok: true };
}

const replySchema = z.object({ id: idSchema, body: z.string().trim().min(1, "Balasan tidak boleh kosong.").max(MAX_COMMENT, "Balasan maksimal 2.000 karakter.") });

/** Answers a comment as the team: shown at once with a "Tim" badge, and the comment it answers is approved. */
export async function replyToComment(input: { id: string; body: string }): Promise<Result> {
  const user = await authorize();
  if ("error" in user) return { ok: false, error: user.error };
  const parsed = replySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (!(await addStaffReply(parsed.data.id, user.name, parsed.data.body))) return notFound;
  await logActivity({ user, action: "comment.reply", target: { type: "comment", id: parsed.data.id, label: await commentLabel(parsed.data.id) } });
  return { ok: true };
}

/** Bulk actions in Komentar: set one status on several comments. */
export async function moderateComments(ids: string[], status: (typeof COMMENT_STATUSES)[number]): Promise<Result> {
  const user = await authorize();
  if ("error" in user) return { ok: false, error: user.error };
  const parsed = z.array(idSchema).min(1).max(200).safeParse(ids);
  if (!parsed.success || !COMMENT_STATUSES.includes(status)) return { ok: false, error: "Pilihan tidak valid." };
  await setCommentStatus(parsed.data, status);
  await logActivity({ user, action: "comment.moderate", target: { type: "comment" }, meta: { status, count: parsed.data.length } });
  return { ok: true };
}

/** Bulk delete in Komentar (replies of a deleted comment go with it). */
export async function deleteComments(ids: string[]): Promise<Result> {
  const user = await authorize();
  if ("error" in user) return { ok: false, error: user.error };
  const parsed = z.array(idSchema).min(1).max(200).safeParse(ids);
  if (!parsed.success) return { ok: false, error: "Pilihan tidak valid." };
  await removeComments(parsed.data);
  await logActivity({ user, action: "comment.delete", target: { type: "comment" }, meta: { count: parsed.data.length } });
  return { ok: true };
}

const staffCommentSchema = z.object({
  pageId: idSchema,
  body: z.string().trim().min(1, "Komentar tidak boleh kosong.").max(MAX_COMMENT, "Komentar maksimal 2.000 karakter."),
});

/** A new top-level comment on a published page, as the team. */
export async function postStaffComment(input: { pageId: string; body: string }): Promise<Result> {
  const user = await authorize();
  if ("error" in user) return { ok: false, error: user.error };
  const parsed = staffCommentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (!(await addStaffComment(parsed.data.pageId, user.name, parsed.data.body))) return { ok: false, error: "Halaman tidak ditemukan atau belum terbit." };
  await logActivity({ user, action: "comment.create", target: { type: "page", id: parsed.data.pageId, label: await pageLabel(parsed.data.pageId) } });
  return { ok: true };
}

const settingsSchema = z.object({ enabled: z.boolean(), moderation: z.boolean(), sectionFeedback: z.boolean().default(true) });

/** Pengaturan → Komentar. Admins only. */
export async function saveCommentSettings(input: CommentSettings): Promise<Result> {
  const user = await authorize("admin");
  if ("error" in user) return { ok: false, error: user.error };
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pengaturan komentar tidak valid." };
  await db
    .insert(schema.settings)
    .values({ key: "comments", value: parsed.data })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: parsed.data } });
  updateTag("settings");
  await logActivity({ user, action: "settings.save", target: { type: "settings", id: "komentar", label: "Komentar" }, meta: parsed.data });
  return { ok: true };
}
