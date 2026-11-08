"use server";

import { updateTag } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { authorize } from "@/lib/auth/dal";
import { canEditPage, NO_PAGE_ACCESS } from "@/lib/auth/page-access";
import { logActivity } from "@/lib/activity";
import { notify } from "@/lib/notify";
import { NOT_FOUND, publishWorkingCopy, type Draft } from "@/lib/pages/service";
import { forgetRedirects } from "@/lib/redirects";

/**
 * Approval workflow. A contributor (or anyone who wants a second pair of eyes)
 * submits a page: `approvalStatus = "pending"`. Editors and admins approve it
 * (publishes the saved working copy through `publishWorkingCopy`, which clears
 * the status and sends "page.published") or ask for changes with a note (`"changes_requested"`). The
 * editor saves its working copy before calling these.
 */

type Result = { ok: true; version?: number; slug?: string } | { ok: false; error: string };

const isId = (id: unknown): id is string => z.uuid().safeParse(id).success;
const noteSchema = z.string().trim().max(1000, "Catatan maksimal 1.000 karakter.");

async function pageFor(pageId: string) {
  const [page] = await db
    .select({
      id: schema.pages.id,
      kind: schema.pages.kind,
      title: schema.pages.draftTitle,
      description: schema.pages.draftDescription,
      content: schema.pages.draftContent,
      seo: schema.pages.draftSeo,
      cover: schema.pages.draftCoverImage,
      version: schema.pages.draftVersion,
      approvalStatus: schema.pages.approvalStatus,
      requestedById: schema.pages.approvalRequestedById,
      authorId: schema.pages.authorId,
    })
    .from(schema.pages)
    .where(eq(schema.pages.id, pageId));
  return page ?? null;
}

/** "Ajukan untuk ditinjau": anyone who may edit the page. */
export async function submitForApproval(pageId: string, note?: string | null): Promise<Result> {
  const user = await authorize("any");
  if ("error" in user) return { ok: false, error: user.error };
  if (!isId(pageId)) return { ok: false, error: NOT_FOUND };
  if (!(await canEditPage(user, pageId))) return { ok: false, error: NO_PAGE_ACCESS };
  const parsedNote = noteSchema.safeParse(note ?? "");
  if (!parsedNote.success) return { ok: false, error: parsedNote.error.issues[0].message };
  const page = await pageFor(pageId);
  if (!page || page.kind !== "doc") return { ok: false, error: NOT_FOUND };
  if (!page.title.trim()) return { ok: false, error: "Beri judul sebelum mengajukan." };
  if (page.approvalStatus === "pending") return { ok: false, error: "Halaman ini sudah diajukan dan menunggu persetujuan." };
  await db
    .update(schema.pages)
    .set({
      approvalStatus: "pending",
      approvalNote: parsedNote.data || null,
      approvalRequestedById: user.id,
      approvalRequestedAt: new Date(),
    })
    .where(eq(schema.pages.id, pageId));
  await logActivity({ user, action: "page.submit", target: { type: "page", id: pageId, label: page.title }, meta: parsedNote.data ? { note: parsedNote.data } : undefined });
  await notify({ type: "page.submitted", pageId, title: page.title, by: user.name, note: parsedNote.data || null, actorId: user.id });
  return { ok: true };
}

/** "Batalkan pengajuan": the person who submitted it, or staff. */
export async function withdrawSubmission(pageId: string): Promise<Result> {
  const user = await authorize("any");
  if ("error" in user) return { ok: false, error: user.error };
  if (!isId(pageId)) return { ok: false, error: NOT_FOUND };
  if (!(await canEditPage(user, pageId))) return { ok: false, error: NO_PAGE_ACCESS };
  const [page] = await db
    .update(schema.pages)
    .set({ approvalStatus: null, approvalNote: null })
    .where(and(eq(schema.pages.id, pageId), eq(schema.pages.approvalStatus, "pending")))
    .returning({ title: schema.pages.draftTitle });
  if (!page) return { ok: false, error: "Halaman ini tidak sedang diajukan." };
  await logActivity({ user, action: "page.withdraw", target: { type: "page", id: pageId, label: page.title } });
  return { ok: true };
}

/** "Setujui & terbitkan": publishes the saved working copy. Editors and admins. */
export async function approvePage(pageId: string, expectedVersion?: number): Promise<Result> {
  const user = await authorize("pages.approve");
  if ("error" in user) return { ok: false, error: user.error };
  if (!isId(pageId)) return { ok: false, error: NOT_FOUND };
  const page = await pageFor(pageId);
  if (!page || page.kind !== "doc") return { ok: false, error: NOT_FOUND };
  if (page.approvalStatus !== "pending") return { ok: false, error: "Halaman ini tidak sedang menunggu persetujuan." };
  if (Number.isInteger(expectedVersion) && expectedVersion !== page.version) {
    return { ok: false, error: "Pengaju menyimpan perubahan baru setelah Anda membukanya. Muat ulang halaman untuk melihat versi terbaru sebelum menyetujui." };
  }
  const draft: Draft = { title: page.title, description: page.description, content: page.content, seo: page.seo, cover: page.cover };
  const result = await publishWorkingCopy(pageId, draft, null, user.id, (tag) => updateTag(tag), page.version);
  if (!result.ok) return { ok: false, error: result.error };
  forgetRedirects();
  const href = `/docs/${result.slug}`;
  await logActivity({ user, action: "page.approve", target: { type: "page", id: pageId, label: page.title }, meta: { slug: result.slug } });
  await notify({ type: "page.approved", pageId, title: page.title, href, by: user.name, authorId: page.requestedById ?? page.authorId, actorId: user.id });
  return { ok: true, version: result.version, slug: result.slug };
}

/** "Minta perubahan" with a note the submitter sees in the editor. Editors and admins. */
export async function requestChanges(pageId: string, note: string): Promise<Result> {
  const user = await authorize("pages.approve");
  if ("error" in user) return { ok: false, error: user.error };
  if (!isId(pageId)) return { ok: false, error: NOT_FOUND };
  const parsed = noteSchema.min(1, "Tulis apa yang perlu diubah.").safeParse(note);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const page = await pageFor(pageId);
  if (!page || page.kind !== "doc") return { ok: false, error: NOT_FOUND };
  if (page.approvalStatus !== "pending") return { ok: false, error: "Halaman ini tidak sedang menunggu persetujuan." };
  await db.update(schema.pages).set({ approvalStatus: "changes_requested", approvalNote: parsed.data }).where(eq(schema.pages.id, pageId));
  await logActivity({ user, action: "page.request_changes", target: { type: "page", id: pageId, label: page.title }, meta: { note: parsed.data } });
  await notify({ type: "page.changes_requested", pageId, title: page.title, by: user.name, note: parsed.data, authorId: page.requestedById ?? page.authorId, actorId: user.id });
  return { ok: true };
}
