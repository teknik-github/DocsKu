"use server";

import { updateTag } from "next/cache";
import { forgetRouteExistence } from "@/lib/route-exists";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { authorize } from "@/lib/auth/dal";
import { logActivity, pageLabel } from "@/lib/activity";
import { BIO_MAX, isAvatarUrl, JOB_TITLE_MAX, MAX_LINKS, usernameError } from "@/lib/authors";
import { STORED_NAME } from "@/lib/media";
import { emailSchema, fieldErrors, keepValues, type FormState } from "@/lib/validation";

/**
 * Profil: the public author profile (name, username, photo, job title, bio,
 * links) and the account email. Public pages read authors through
 * lib/data/authors.ts, cached under "authors".
 */

type Result = { ok: true } | { ok: false; error: string };

async function usernameTaken(username: string, exceptId: string) {
  const [row] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.username, username), ne(schema.users.id, exceptId)));
  return Boolean(row);
}

/** Live check for the username field: format, reserved words, and whether someone else has it. */
export async function checkUsername(value: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await authorize("any");
  if ("error" in user) return { ok: false, error: user.error };
  const username = String(value ?? "").trim();
  const error = usernameError(username);
  if (error) return { ok: false, error };
  if (await usernameTaken(username, user.id)) return { ok: false, error: "Sudah dipakai anggota tim lain." };
  return { ok: true };
}

const linkSchema = z.object({
  label: z.string().trim().min(1, "Isi nama tautan.").max(40, "Nama tautan maksimal 40 karakter."),
  url: z
    .string()
    .trim()
    .max(300)
    .refine((v) => /^https:\/\/[^\s"'<>]+\.[^\s"'<>]+$/i.test(v), "Tautan harus diawali https://"),
});

const publicProfileSchema = z.object({
  name: z.string().trim().min(1, "Nama wajib diisi.").max(100),
  username: z
    .string()
    .trim()
    .transform((v) => v.toLowerCase())
    .superRefine((v, ctx) => {
      const error = v ? usernameError(v) : null;
      if (error) ctx.addIssue({ code: "custom", message: error });
    }),
  jobTitle: z.string().trim().max(JOB_TITLE_MAX, `Maksimal ${JOB_TITLE_MAX} karakter.`),
  bio: z.string().trim().max(BIO_MAX, `Maksimal ${BIO_MAX} karakter.`),
  links: z.array(linkSchema).max(MAX_LINKS, `Maksimal ${MAX_LINKS} tautan.`),
});

/** "Profil publik": what readers see under articles and on /penulis/<username>. */
export async function updatePublicProfile(_: FormState, formData: FormData): Promise<FormState> {
  const user = await authorize("any");
  if ("error" in user) return { error: user.error };
  const values = keepValues(formData, ["name", "username", "jobTitle", "bio", "links"]);
  let links: unknown = [];
  try {
    links = JSON.parse(String(formData.get("links") || "[]"));
  } catch {
    return { fieldErrors: { links: "Tautan tidak valid." }, values };
  }
  const parsed = publicProfileSchema.safeParse({ ...Object.fromEntries(formData), links });
  if (!parsed.success) {
    const errors = fieldErrors(parsed.error);
    // Errors inside a link ("links.1.url") are shown on the links block.
    const linkError = parsed.error.issues.find((issue) => issue.path[0] === "links");
    if (linkError) errors.links = linkError.message;
    return { fieldErrors: errors, values };
  }
  const data = parsed.data;
  if (data.username && (await usernameTaken(data.username, user.id))) return { fieldErrors: { username: "Sudah dipakai anggota tim lain." }, values };

  const [before] = await db
    .select({ name: schema.users.name, username: schema.users.username, jobTitle: schema.users.jobTitle, bio: schema.users.bio, links: schema.users.links })
    .from(schema.users)
    .where(eq(schema.users.id, user.id));
  const next = { name: data.name, username: data.username || null, jobTitle: data.jobTitle || null, bio: data.bio || null, links: data.links };
  await db.update(schema.users).set(next).where(eq(schema.users.id, user.id));
  updateTag("authors");
  forgetRouteExistence();

  const changed = before ? (Object.keys(next) as (keyof typeof next)[]).filter((key) => JSON.stringify(before[key]) !== JSON.stringify(next[key])) : [];
  if (changed.length) {
    await logActivity({
      user: { id: user.id, name: data.name },
      action: "user.profile",
      target: { type: "user", id: user.id, label: data.name },
      meta: { fields: changed, ...(changed.includes("name") && before ? { nameFrom: before.name } : {}) },
    });
  }
  return { success: "Profil publik disimpan.", values: { ...values, username: data.username } };
}

/** The photo: an upload from the media library (/media/…) or null to remove it. */
export async function setAvatar(url: string | null): Promise<Result> {
  const user = await authorize("any");
  if ("error" in user) return { ok: false, error: user.error };
  if (url !== null) {
    if (typeof url !== "string" || !isAvatarUrl(url)) return { ok: false, error: "Foto tidak valid." };
    // Uploaded files must exist in the media library.
    const file = url.startsWith("/media/") ? url.slice("/media/".length) : null;
    if (file) {
      if (!STORED_NAME.test(file)) return { ok: false, error: "Foto tidak valid." };
      const [row] = await db.select({ id: schema.media.id, mime: schema.media.mimeType }).from(schema.media).where(eq(schema.media.filename, file));
      if (!row || !row.mime.startsWith("image/")) return { ok: false, error: "Foto tidak ditemukan." };
    }
  }
  await db.update(schema.users).set({ avatar: url }).where(eq(schema.users.id, user.id));
  updateTag("authors");
  forgetRouteExistence();
  await logActivity({ user, action: "user.profile", target: { type: "user", id: user.id, label: user.name }, meta: { fields: ["avatar"], ...(url ? {} : { removed: true }) } });
  return { ok: true };
}

const emailFormSchema = z.object({ email: emailSchema });

/** "Akun": the sign-in email (never shown publicly). */
export async function updateEmail(_: FormState, formData: FormData): Promise<FormState> {
  const user = await authorize("any");
  if ("error" in user) return { error: user.error };
  const values = keepValues(formData, ["email"]);
  const parsed = emailFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  const email = parsed.data.email;
  if (email === user.email) return { success: "Tidak ada perubahan.", values };
  const [taken] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.email, email), ne(schema.users.id, user.id)));
  if (taken) return { fieldErrors: { email: "Email sudah dipakai akun lain." }, values };
  await db.update(schema.users).set({ email }).where(eq(schema.users.id, user.id));
  await logActivity({ user, action: "user.profile", target: { type: "user", id: user.id, label: user.name }, meta: { emailFrom: user.email, emailTo: email } });
  return { success: "Email disimpan.", values: { email } };
}

export type TeamAuthor = { id: string; name: string; avatar: string | null; jobTitle: string | null };

/** The editor's "Penulis" picker: the page's author (creator, or last editor for older pages) and the team. */
export async function getPageAuthor(pageId: string): Promise<{ authorId: string | null; team: TeamAuthor[] } | null> {
  const user = await authorize("any");
  if ("error" in user || !z.uuid().safeParse(pageId).success) return null;
  const [[page], team] = await Promise.all([
    db
      .select({ authorId: sql<string | null>`coalesce(${schema.pages.authorId}, ${schema.pages.updatedById})` })
      .from(schema.pages)
      .where(eq(schema.pages.id, pageId)),
    db
      .select({ id: schema.users.id, name: schema.users.name, avatar: schema.users.avatar, jobTitle: schema.users.jobTitle })
      .from(schema.users)
      .orderBy(asc(schema.users.name)),
  ]);
  return page ? { authorId: page.authorId, team } : null;
}

/** The page's author (byline and author box). Applies immediately, like "Unggulan". */
export async function setPageAuthor(pageId: string, authorId: string): Promise<Result> {
  const user = await authorize();
  if ("error" in user) return { ok: false, error: user.error };
  if (!z.uuid().safeParse(pageId).success || !z.uuid().safeParse(authorId).success) return { ok: false, error: "Pilihan tidak valid." };
  const [author] = await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(eq(schema.users.id, authorId));
  if (!author) return { ok: false, error: "Anggota tim tidak ditemukan." };
  const updated = await db.update(schema.pages).set({ authorId }).where(eq(schema.pages.id, pageId)).returning({ id: schema.pages.id });
  if (!updated.length) return { ok: false, error: "Halaman tidak ditemukan." };
  updateTag("pages");
  updateTag("authors");
  forgetRouteExistence();
  await logActivity({ user, action: "page.author", target: { type: "page", id: pageId, label: await pageLabel(pageId) }, meta: { author: author.name } });
  return { ok: true };
}
