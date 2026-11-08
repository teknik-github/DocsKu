"use server";

import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { authorize } from "@/lib/auth/dal";
import { logActivity, pageLabel, pageLabels } from "@/lib/activity";
import { EMPTY_DOC } from "@/lib/content/doc";
import { PLACEHOLDER_SLUG, slugify, uniqueSlug } from "@/lib/slug";
import { NO_NAV, readNavigation, resolveSection, writeNavigation } from "@/lib/automation";
import { findCategory, placePages } from "@/lib/categories";
import { forgetRedirects, recordSlugChange } from "@/lib/redirects";
import { slugLanguageError } from "@/lib/translations";
import { templateSeed } from "@/lib/templates";
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
  forgetRedirects();
}

/**
 * New draft, opened in the editor. With a `category` field (a navigation
 * section id, from Halaman → a category) the page is listed in that category at
 * once: drafts stay off the public site, and automation won't move it on publish.
 * With a `template` field ("builtin:<key>" or a page_templates id, see
 * lib/templates.ts) the working copy starts from that template; the live
 * columns stay empty until the first publish.
 */
export async function createPage(formData?: FormData) {
  const user = await authorize();
  if ("error" in user) redirect("/admin/login");
  const wanted = formData?.get("category");
  const navigation = typeof wanted === "string" && wanted ? await readNavigation() : null;
  const category = navigation && typeof wanted === "string" && findCategory(navigation, wanted) ? wanted : null;
  const templateId = formData?.get("template");
  const seed = typeof templateId === "string" && templateId ? await templateSeed(templateId) : null;
  const slug = await uniqueSlug(PLACEHOLDER_SLUG);
  const [page] = await db
    .insert(schema.pages)
    .values({
      slug,
      title: "",
      draftTitle: seed?.title ?? "",
      draftDescription: seed?.description ?? "",
      content: EMPTY_DOC,
      draftContent: seed?.content ?? EMPTY_DOC,
      navSection: category,
      authorId: user.id,
      updatedById: user.id,
    })
    .returning({ id: schema.pages.id });
  if (navigation && category) await writeNavigation(placePages(navigation, [page.id], category));
  const meta = { ...(category ? { category } : {}), ...(seed ? { template: seed.name } : {}) };
  await logActivity({ user, action: "page.create", target: { type: "page", id: page.id, label: seed?.title || "Tanpa judul" }, meta: Object.keys(meta).length ? meta : undefined });
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
  const result = await publishWorkingCopy(pageId, parsed.data, publishAt, user.id, updateTag);
  if (result.ok) {
    await logActivity({
      user,
      action: result.status === "scheduled" ? "page.schedule" : "page.publish",
      target: { type: "page", id: pageId, label: parsed.data.title || (await pageLabel(pageId)) },
      meta: result.status === "scheduled" ? { publishAt: result.publishedAt, slug: result.slug } : { slug: result.slug },
    });
  }
  return result;
}

/** Where the first publish puts the page in the navigation: a section id, "none", or null (automatic). */
export async function setNavSection(pageId: string, value: string | null) {
  const user = await authorize();
  if ("error" in user) return { ok: false as const, error: user.error };
  if (!isId(pageId)) return { ok: false as const, error: NOT_FOUND };
  const navSection = value === null || value === NO_NAV ? value : await resolveSection(value);
  if (value && !navSection) return { ok: false as const, error: "Bagian navigasi tidak ditemukan." };
  // A translation takes its original's place in navigation and never gets its own.
  await db.update(schema.pages).set({ navSection }).where(and(eq(schema.pages.id, pageId), eq(schema.pages.kind, "doc"), isNull(schema.pages.translationOf)));
  return { ok: true as const };
}

/** Takes the page off the site (or cancels a schedule); content is kept. */
export async function unpublishPage(pageId: string): Promise<SaveResult> {
  const user = await authorize();
  if ("error" in user) return { ok: false, error: user.error };
  if (!isId(pageId)) return { ok: false as const, error: NOT_FOUND };
  const [before] = await db.select({ status: schema.pages.status }).from(schema.pages).where(eq(schema.pages.id, pageId));
  const result = await unpublish(pageId, user.id, updateTag);
  if (result.ok && before && before.status !== "draft") {
    await logActivity({
      user,
      action: before.status === "scheduled" ? "page.unschedule" : "page.unpublish",
      target: { type: "page", id: pageId, label: await pageLabel(pageId) },
    });
  }
  return result;
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
  // Translations stay under their language; originals keep out of a language's prefix.
  const languageError = await slugLanguageError(pageId, parsed.data);
  if (languageError) return { ok: false, error: languageError };
  const [taken] = await db
    .select({ id: schema.pages.id })
    .from(schema.pages)
    .where(and(eq(schema.pages.slug, parsed.data), ne(schema.pages.id, pageId)));
  if (taken) return { ok: false, error: "Slug ini sudah dipakai halaman lain." };
  const [before] = await db
    .select({ slug: schema.pages.slug, publishedAt: schema.pages.publishedAt })
    .from(schema.pages)
    .where(and(eq(schema.pages.id, pageId), eq(schema.pages.kind, "doc")));
  if (!before) return { ok: false, error: "Halaman tidak ditemukan." };
  const [page] = await db
    .update(schema.pages)
    .set({ slug: parsed.data, updatedById: user.id })
    .where(eq(schema.pages.id, pageId))
    .returning({ status: schema.pages.status });
  // Only an address that was ever public needs to keep working.
  if (before.publishedAt && before.publishedAt <= new Date()) await recordSlugChange(pageId, before.slug, parsed.data);
  else forgetRedirects();
  if (page.status === "published") refreshPublicSite();
  if (before.slug !== parsed.data) {
    await logActivity({ user, action: "page.slug", target: { type: "page", id: pageId, label: await pageLabel(pageId) }, meta: { from: before.slug, to: parsed.data } });
  }
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
  const label = await pageLabel(pageId);
  const [deleted] = await db
    .delete(schema.pages)
    .where(and(eq(schema.pages.id, pageId), eq(schema.pages.kind, "doc")))
    .returning({ status: schema.pages.status, slug: schema.pages.slug });
  if (!deleted) return { ok: false as const, error: "Halaman tidak ditemukan atau tidak bisa dihapus." };
  await logActivity({ user, action: "page.delete", target: { type: "page", id: pageId, label }, meta: { slug: deleted.slug, status: deleted.status } });
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
  const labels = await pageLabels(ids.data);
  const deleted = await db
    .delete(schema.pages)
    .where(and(inArray(schema.pages.id, ids.data), eq(schema.pages.kind, "doc")))
    .returning({ id: schema.pages.id, slug: schema.pages.slug });
  for (const page of deleted) {
    await logActivity({ user, action: "page.delete", target: { type: "page", id: page.id, label: labels.get(page.id) }, meta: { slug: page.slug, bulk: true } });
  }
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
    .select({
      status: schema.pages.status,
      title: schema.pages.draftTitle,
      description: schema.pages.draftDescription,
      content: schema.pages.draftContent,
      seo: schema.pages.draftSeo,
      cover: schema.pages.draftCoverImage,
    })
    .from(schema.pages)
    .where(eq(schema.pages.id, pageId));
  if (!page) return { ok: false as const, error: NOT_FOUND };

  const draft = { title: revision.title, description: revision.description, content: revision.content, seo: revision.seo, cover: revision.coverImage };
  // Keep the working copy being replaced, so a restore can always be undone from the history.
  const current = { title: page.title, description: page.description, content: page.content, seo: page.seo, cover: page.cover };
  if (JSON.stringify(current) !== JSON.stringify(draft)) await addRevision(pageId, current, "before-restore", user.id);
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
  await logActivity({ user, action: "page.restore", target: { type: "page", id: pageId, label: draft.title || (await pageLabel(pageId)) }, meta: { revisionId, revisionAt: revision.createdAt.toISOString() } });
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
  await logActivity({ user, action: "page.create", target: { type: "page", id: page.id, label: parsed.data.title }, meta: { via: "ai" } });
  if (mode === "draft") return { ok: true, id: page.id, slug: page.slug, status: "draft" };

  const result = await publishWorkingCopy(page.id, page.draft, mode === "schedule" ? (publishAt ?? null) : null, user.id, updateTag);
  if (!result.ok) return { ok: false, error: `Draf dibuat, tetapi gagal diterbitkan: ${result.error}` };
  await logActivity({
    user,
    action: result.status === "scheduled" ? "page.schedule" : "page.publish",
    target: { type: "page", id: page.id, label: parsed.data.title },
    meta: { via: "ai", slug: result.slug, ...(result.status === "scheduled" ? { publishAt: result.publishedAt } : {}) },
  });
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
  await logActivity({ user, action: featured ? "page.feature" : "page.unfeature", target: { type: "page", id: pageId, label: await pageLabel(pageId) } });
  return { ok: true as const };
}
