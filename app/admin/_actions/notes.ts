"use server";

import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { authorize, type SessionUser } from "@/lib/auth/dal";
import { canEditPage } from "@/lib/auth/page-access";
import { can } from "@/lib/auth/permissions";
import { logActivity } from "@/lib/activity";
import { notify } from "@/lib/notify";

/**
 * Internal notes on a page in the editor: never shown on the site. Anyone who
 * may edit the page reads and writes them (a contributor: their own pages).
 * A note can be deleted by its writer or by an admin/editor; anyone with
 * access can mark it resolved or reopen it.
 */

export type NoteView = {
  id: string;
  parentId: string | null;
  quote: string;
  body: string;
  authorId: string | null;
  authorName: string;
  authorAvatar: string | null;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
};

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const NOT_FOUND = "Halaman tidak ditemukan.";
const isId = (value: unknown): value is string => z.uuid().safeParse(value).success;

async function pageAccess(pageId: string): Promise<SessionUser | { error: string }> {
  const user = await authorize("any");
  if ("error" in user) return user;
  if (!isId(pageId)) return { error: NOT_FOUND };
  const [page] = await db.select({ id: schema.pages.id }).from(schema.pages).where(eq(schema.pages.id, pageId));
  if (!page || !(await canEditPage(user, pageId))) return { error: NOT_FOUND };
  return user;
}

export async function listNotes(pageId: string): Promise<Result<{ notes: NoteView[] }>> {
  const user = await pageAccess(pageId);
  if ("error" in user) return { ok: false, error: user.error };
  const rows = await db
    .select({
      id: schema.pageNotes.id,
      parentId: schema.pageNotes.parentId,
      quote: schema.pageNotes.quote,
      body: schema.pageNotes.body,
      authorId: schema.pageNotes.authorId,
      authorName: schema.users.name,
      authorAvatar: schema.users.avatar,
      createdAt: schema.pageNotes.createdAt,
      resolvedAt: schema.pageNotes.resolvedAt,
      resolvedById: schema.pageNotes.resolvedById,
    })
    .from(schema.pageNotes)
    .leftJoin(schema.users, eq(schema.users.id, schema.pageNotes.authorId))
    .where(eq(schema.pageNotes.pageId, pageId))
    .orderBy(asc(schema.pageNotes.createdAt));
  const resolverIds = [...new Set(rows.flatMap((row) => (row.resolvedById ? [row.resolvedById] : [])))];
  const names = new Map(
    resolverIds.length
      ? (await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(inArray(schema.users.id, resolverIds))).map((person) => [person.id, person.name])
      : [],
  );
  return {
    ok: true,
    notes: rows.map((row) => ({
      id: row.id,
      parentId: row.parentId,
      quote: row.quote,
      body: row.body,
      authorId: row.authorId,
      authorName: row.authorName ?? "Pengguna terhapus",
      authorAvatar: row.authorAvatar ?? null,
      createdAt: row.createdAt.toISOString(),
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      resolvedBy: row.resolvedById ? (names.get(row.resolvedById) ?? null) : null,
    })),
  };
}

const noteSchema = z.object({
  body: z.string().trim().min(1, "Catatan masih kosong.").max(2000, "Catatan maksimal 2.000 karakter."),
  quote: z.string().trim().max(300).default(""),
});

/** A new note (optionally on quoted text), or a reply when `parentId` is a top-level note of the same page. */
export async function addNote(pageId: string, input: { body: string; quote?: string; parentId?: string }): Promise<Result<{ id: string }>> {
  const user = await pageAccess(pageId);
  if ("error" in user) return { ok: false, error: user.error };
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  let parentId: string | null = null;
  if (input.parentId) {
    if (!isId(input.parentId)) return { ok: false, error: "Catatan tidak ditemukan." };
    const [parent] = await db
      .select({ id: schema.pageNotes.id })
      .from(schema.pageNotes)
      .where(and(eq(schema.pageNotes.id, input.parentId), eq(schema.pageNotes.pageId, pageId), isNull(schema.pageNotes.parentId)));
    if (!parent) return { ok: false, error: "Catatan tidak ditemukan." };
    parentId = parent.id;
  }
  const [row] = await db
    .insert(schema.pageNotes)
    .values({ pageId, parentId, authorId: user.id, quote: parentId ? "" : parsed.data.quote, body: parsed.data.body })
    .returning({ id: schema.pageNotes.id });
  // A reply reopens a resolved conversation: someone still has something to say.
  if (parentId) await db.update(schema.pageNotes).set({ resolvedAt: null, resolvedById: null }).where(eq(schema.pageNotes.id, parentId));
  if (!parentId) await logActivity({ user, action: "note.create", target: { type: "page", id: pageId, label: parsed.data.quote || parsed.data.body.slice(0, 80) } });

  // Email/webhooks: the page's owner and author, and for a reply everyone already in the conversation.
  const threadId = parentId ?? row.id;
  const [thread] = await db.select({ quote: schema.pageNotes.quote }).from(schema.pageNotes).where(eq(schema.pageNotes.id, threadId));
  const people = parentId
    ? await db
        .selectDistinct({ id: schema.pageNotes.authorId })
        .from(schema.pageNotes)
        .where(or(eq(schema.pageNotes.id, parentId), eq(schema.pageNotes.parentId, parentId)))
    : [];
  const [page] = await db.select({ title: schema.pages.draftTitle }).from(schema.pages).where(eq(schema.pages.id, pageId));
  await notify({
    type: "note.new",
    actorId: user.id,
    noteId: threadId,
    pageId,
    pageTitle: page?.title || "Tanpa judul",
    by: user.name,
    excerpt: parsed.data.body.slice(0, 300),
    quote: thread?.quote ?? "",
    reply: Boolean(parentId),
    participants: people.flatMap((person) => (person.id ? [person.id] : [])),
  });
  return { ok: true, id: row.id };
}

async function ownNote(user: SessionUser, id: string) {
  if (!isId(id)) return null;
  const [note] = await db
    .select({ id: schema.pageNotes.id, pageId: schema.pageNotes.pageId, authorId: schema.pageNotes.authorId, parentId: schema.pageNotes.parentId, body: schema.pageNotes.body })
    .from(schema.pageNotes)
    .where(eq(schema.pageNotes.id, id));
  if (!note || !(await canEditPage(user, note.pageId))) return null;
  return note;
}

/** Marks a top-level note resolved (or open again). */
export async function resolveNote(id: string, resolved: boolean): Promise<Result> {
  const user = await authorize("any");
  if ("error" in user) return { ok: false, error: user.error };
  const note = await ownNote(user, id);
  if (!note || note.parentId) return { ok: false, error: "Catatan tidak ditemukan." };
  await db
    .update(schema.pageNotes)
    .set(resolved ? { resolvedAt: new Date(), resolvedById: user.id } : { resolvedAt: null, resolvedById: null })
    .where(eq(schema.pageNotes.id, id));
  if (resolved) await logActivity({ user, action: "note.resolve", target: { type: "page", id: note.pageId, label: note.body.slice(0, 80) } });
  return { ok: true };
}

/** Deletes a note (and its replies): its writer, or an admin/editor. */
export async function deleteNote(id: string): Promise<Result> {
  const user = await authorize("any");
  if ("error" in user) return { ok: false, error: user.error };
  const note = await ownNote(user, id);
  if (!note) return { ok: false, error: "Catatan tidak ditemukan." };
  if (note.authorId !== user.id && !can(user, "pages.editAny")) return { ok: false, error: "Hanya penulis catatan, editor, atau admin yang bisa menghapusnya." };
  await db.delete(schema.pageNotes).where(eq(schema.pageNotes.id, id));
  await logActivity({ user, action: "note.delete", target: { type: "page", id: note.pageId, label: note.body.slice(0, 80) } });
  return { ok: true };
}
