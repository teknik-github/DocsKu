"use server";

import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { authorize } from "@/lib/auth/dal";
import { EMPTY_DOC } from "@/lib/content/doc";
import { PLACEHOLDER_SLUG, slugify, uniqueSlug } from "@/lib/slug";
import { NO_NAV, resolveSection } from "@/lib/automation";
import {
  NOT_FOUND,
  addRevision,
  createPageFromMarkdown,
  draftSchema,
  markdownPageSchema,
  publishWorkingCopy,
  saveWorkingCopy,
  slugSchema,
  unpublish,
  type DraftInput,
  type PublishResult,
} from "@/lib/pages/service";
import type { NavigationData, NavItemData } from "@/lib/site-types";

export type SaveResult = { ok: true; savedAt: string; hasChanges: boolean } | { ok: false; error: string };

const isId = (id: unknown): id is string => z.uuid().safeParse(id).success;

/** Pages, navigation, and search all derive from published pages. */
function refreshPublicSite() {
  updateTag("pages");
}

export async function createPage() {
  const user = await authorize();
  if ("error" in user) redirect("/admin/login");
  const slug = await uniqueSlug(PLACEHOLDER_SLUG);
  const [page] = await db
    .insert(schema.pages)
    .values({
      slug,
      title: "",
      draftTitle: "",
      content: EMPTY_DOC,
      draftContent: EMPTY_DOC,
      authorId: user.id,
      updatedById: user.id,
    })
    .returning({ id: schema.pages.id });
  redirect(`/admin/pages/${page.id}`);
}

/**
 * Saves the working copy. Visitors keep seeing the live version until the page
 * is (re)published. `revision` is true for manual saves (Ctrl+S).
 */
export async function saveDraft(pageId: string, input: DraftInput, revision = false): Promise<SaveResult> {
  const user = await authorize();
  if ("error" in user) return { ok: false, error: user.error };
  if (!isId(pageId)) return { ok: false as const, error: NOT_FOUND };
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  return saveWorkingCopy(pageId, parsed.data, user.id, revision ? "save" : undefined);
}

/** Publishes (or schedules) the editor's working copy. */
export async function publishPage(pageId: string, input: DraftInput, publishAt: string | null): Promise<PublishResult> {
  const user = await authorize();
  if ("error" in user) return { ok: false, error: user.error };
  if (!isId(pageId)) return { ok: false as const, error: NOT_FOUND };
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  return publishWorkingCopy(pageId, parsed.data, publishAt, user.id, updateTag);
}

/** Where the first publish puts the page in the navigation: a section id, "none", or null (automatic). */
export async function setNavSection(pageId: string, value: string | null) {
  const user = await authorize();
  if ("error" in user) return { ok: false as const, error: user.error };
  if (!isId(pageId)) return { ok: false as const, error: NOT_FOUND };
  const navSection = value === null || value === NO_NAV ? value : await resolveSection(value);
  if (value && !navSection) return { ok: false as const, error: "Bagian navigasi tidak ditemukan." };
  await db.update(schema.pages).set({ navSection }).where(and(eq(schema.pages.id, pageId), eq(schema.pages.kind, "doc")));
  return { ok: true as const };
}

/** Takes the page off the site (or cancels a schedule); content is kept. */
export async function unpublishPage(pageId: string): Promise<SaveResult> {
  const user = await authorize();
  if ("error" in user) return { ok: false, error: user.error };
  if (!isId(pageId)) return { ok: false as const, error: NOT_FOUND };
  return unpublish(pageId, user.id, updateTag);
}

/** Discards unpublished edits by copying the live version back into the working copy. */
export async function discardChanges(pageId: string) {
  const user = await authorize();
  if ("error" in user) return { ok: false as const, error: user.error };
  if (!isId(pageId)) return { ok: false as const, error: NOT_FOUND };
  const [page] = await db.select().from(schema.pages).where(eq(schema.pages.id, pageId));
  if (!page) return { ok: false as const, error: NOT_FOUND };
  await db
    .update(schema.pages)
    .set({
      draftTitle: page.title,
      draftDescription: page.description,
      draftContent: page.content,
      draftSeo: page.seo,
      draftCoverImage: page.coverImage,
      hasChanges: false,
      updatedById: user.id,
    })
    .where(eq(schema.pages.id, pageId));
  return {
    ok: true as const,
    draft: { title: page.title, description: page.description, content: page.content, seo: page.seo, cover: page.coverImage },
  };
}

export async function updateSlug(pageId: string, value: string): Promise<{ ok: true; slug: string } | { ok: false; error: string }> {
  const user = await authorize();
  if ("error" in user) return { ok: false, error: user.error };
  if (!isId(pageId)) return { ok: false as const, error: NOT_FOUND };
  const parsed = slugSchema.safeParse(value);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const [taken] = await db
    .select({ id: schema.pages.id })
    .from(schema.pages)
    .where(and(eq(schema.pages.slug, parsed.data), ne(schema.pages.id, pageId)));
  if (taken) return { ok: false, error: "Slug ini sudah dipakai halaman lain." };
  const [page] = await db
    .update(schema.pages)
    .set({ slug: parsed.data, updatedById: user.id })
    .where(and(eq(schema.pages.id, pageId), eq(schema.pages.kind, "doc")))
    .returning({ status: schema.pages.status });
  if (!page) return { ok: false, error: "Halaman tidak ditemukan." };
  if (page.status === "published") refreshPublicSite();
  return { ok: true, slug: parsed.data };
}

/** Suggests a slug from the title, for new pages. */
export async function suggestSlug(pageId: string, title: string) {
  const user = await authorize();
  if ("error" in user) return null;
  if (!isId(pageId)) return null;
  return uniqueSlug(slugify(title), pageId);
}

function withoutPages(items: NavItemData[], ids: Set<string>): NavItemData[] {
  return items.flatMap((item): NavItemData[] => {
    if (item.type === "page") return ids.has(item.pageId) ? [] : [item];
    if (item.type === "group") return [{ ...item, items: withoutPages(item.items, ids) }];
    return [item];
  });
}

/** Removes deleted pages from the stored navigation. */
async function removeFromNavigation(pageIds: string[]) {
  const [row] = await db
    .select({ value: schema.settings.value })
    .from(schema.settings)
    .where(eq(schema.settings.key, "navigation"));
  const navigation = row?.value as NavigationData | undefined;
  if (!navigation) return;
  const ids = new Set(pageIds);
  const cleaned: NavigationData = {
    tabs: navigation.tabs.map((tab) => ({
      ...tab,
      sections: tab.sections.map((section) => ({ ...section, items: withoutPages(section.items, ids) })),
    })),
  };
  await db.update(schema.settings).set({ value: cleaned }).where(eq(schema.settings.key, "navigation"));
  updateTag("navigation");
}

export async function deletePage(pageId: string) {
  const user = await authorize();
  if ("error" in user) return { ok: false as const, error: user.error };
  if (!isId(pageId)) return { ok: false as const, error: NOT_FOUND };
  // The home page can be unpublished but not deleted.
  const [deleted] = await db
    .delete(schema.pages)
    .where(and(eq(schema.pages.id, pageId), eq(schema.pages.kind, "doc")))
    .returning({ status: schema.pages.status });
  if (!deleted) return { ok: false as const, error: "Halaman tidak ditemukan atau tidak bisa dihapus." };
  await removeFromNavigation([pageId]);
  if (deleted.status === "published") refreshPublicSite();
  redirect("/admin/pages");
}

/** Bulk delete from the pages list. */
export async function deletePages(pageIds: string[]) {
  const user = await authorize();
  if ("error" in user) return { ok: false as const, error: user.error };
  const ids = z.array(z.uuid()).max(500).safeParse(pageIds);
  if (!ids.success || !ids.data.length) return { ok: false as const, error: "Tidak ada halaman dipilih." };
  await db.delete(schema.pages).where(and(inArray(schema.pages.id, ids.data), eq(schema.pages.kind, "doc")));
  await removeFromNavigation(ids.data);
  refreshPublicSite();
  return { ok: true as const };
}

/** Loads an older version into the working copy. Publish to make it live. */
export async function restoreRevision(pageId: string, revisionId: string) {
  const user = await authorize();
  if ("error" in user) return { ok: false as const, error: user.error };
  if (!isId(pageId) || !isId(revisionId)) return { ok: false as const, error: "Revisi tidak ditemukan." };
  const [revision] = await db
    .select()
    .from(schema.pageRevisions)
    .where(and(eq(schema.pageRevisions.id, revisionId), eq(schema.pageRevisions.pageId, pageId)));
  if (!revision) return { ok: false as const, error: "Revisi tidak ditemukan." };
  const [page] = await db
    .select({ status: schema.pages.status })
    .from(schema.pages)
    .where(eq(schema.pages.id, pageId));
  if (!page) return { ok: false as const, error: NOT_FOUND };

  const draft = { title: revision.title, description: revision.description, content: revision.content, seo: revision.seo, cover: revision.coverImage };
  await db
    .update(schema.pages)
    .set({
      draftTitle: draft.title,
      draftDescription: draft.description,
      draftContent: draft.content,
      draftSeo: draft.seo,
      draftCoverImage: draft.cover,
      hasChanges: page.status !== "draft",
      updatedById: user.id,
    })
    .where(eq(schema.pages.id, pageId));
  await addRevision(pageId, draft, "restore", user.id);
  return { ok: true as const, draft };
}

const aiDraftSchema = markdownPageSchema.extend({
  publishAt: z.string().trim().max(40).optional(),
  /** "draft" only creates it; "publish" and "schedule" are what the user clicked. */
  mode: z.enum(["draft", "publish", "schedule"]).default("draft"),
});

/**
 * Creates a draft page from an AI Chat proposal, and publishes or schedules it
 * when the user chose that. The Markdown is converted here, not trusted from the client.
 */
export async function createDraftFromProposal(
  input: z.input<typeof aiDraftSchema>,
): Promise<{ ok: true; id: string; slug: string; status: "draft" | "published" | "scheduled"; publishedAt?: string } | { ok: false; error: string }> {
  const user = await authorize();
  if ("error" in user) return { ok: false, error: user.error };
  const parsed = aiDraftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { mode, publishAt } = parsed.data;
  if (mode === "schedule") {
    const when = publishAt ? new Date(publishAt) : null;
    if (!when || Number.isNaN(when.getTime())) return { ok: false, error: "Tanggal jadwal tidak valid." };
    if (when.getTime() <= Date.now() + 30_000) return { ok: false, error: "Tanggal jadwal sudah lewat. Pilih Buat draf lalu jadwalkan dari editor." };
  }

  const page = await createPageFromMarkdown(parsed.data, user.id, "ai");
  if (mode === "draft") return { ok: true, id: page.id, slug: page.slug, status: "draft" };

  const result = await publishWorkingCopy(page.id, page.draft, mode === "schedule" ? (publishAt ?? null) : null, user.id, updateTag);
  if (!result.ok) return { ok: false, error: `Draf dibuat, tetapi gagal diterbitkan: ${result.error}` };
  return { ok: true, id: page.id, slug: result.slug, status: result.status, publishedAt: result.publishedAt };
}

/** Marks a page as featured (shown first, labelled "Unggulan" in the Ghost layout). Applies right away. */
export async function setFeatured(pageId: string, featured: boolean) {
  const user = await authorize();
  if ("error" in user) return { ok: false as const, error: user.error };
  if (!isId(pageId)) return { ok: false as const, error: NOT_FOUND };
  const [page] = await db
    .update(schema.pages)
    .set({ featured: Boolean(featured), updatedById: user.id })
    .where(and(eq(schema.pages.id, pageId), eq(schema.pages.kind, "doc")))
    .returning({ status: schema.pages.status });
  if (!page) return { ok: false as const, error: NOT_FOUND };
  if (page.status === "published") refreshPublicSite();
  return { ok: true as const };
}
