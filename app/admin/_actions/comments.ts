"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { authorize } from "@/lib/auth/dal";
import { addStaffComment, addStaffReply, COMMENT_STATUSES, deleteComment as removeComment, MAX_COMMENT, setCommentStatus } from "@/lib/comments";
import type { CommentSettings } from "@/lib/site-types";

type Result = { ok: true } | { ok: false; error: string };

const idSchema = z.uuid();
const notFound: Result = { ok: false, error: "Komentar tidak ditemukan." };

/** Approve, mark as spam, or send back to the queue. Editors and admins. */
export async function moderateComment(id: string, status: (typeof COMMENT_STATUSES)[number]): Promise<Result> {
  const user = await authorize();
  if ("error" in user) return { ok: false, error: user.error };
  if (!idSchema.safeParse(id).success || !COMMENT_STATUSES.includes(status)) return notFound;
  await setCommentStatus([id], status);
  return { ok: true };
}

/** Deletes a comment and its replies. */
export async function deleteComment(id: string): Promise<Result> {
  const user = await authorize();
  if ("error" in user) return { ok: false, error: user.error };
  if (!idSchema.safeParse(id).success) return notFound;
  await removeComment(id);
  return { ok: true };
}

const replySchema = z.object({ id: idSchema, body: z.string().trim().min(1, "Balasan tidak boleh kosong.").max(MAX_COMMENT, "Balasan maksimal 2.000 karakter.") });

/** Answers a comment as the team: shown at once with a "Tim" badge, and the comment it answers is approved. */
export async function replyToComment(input: { id: string; body: string }): Promise<Result> {
  const user = await authorize();
  if ("error" in user) return { ok: false, error: user.error };
  const parsed = replySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  return (await addStaffReply(parsed.data.id, user.name, parsed.data.body)) ? { ok: true } : notFound;
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
  return (await addStaffComment(parsed.data.pageId, user.name, parsed.data.body)) ? { ok: true } : { ok: false, error: "Halaman tidak ditemukan atau belum terbit." };
}

const settingsSchema = z.object({ enabled: z.boolean(), moderation: z.boolean() });

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
  return { ok: true };
}
