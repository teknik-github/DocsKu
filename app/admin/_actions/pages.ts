"use server";

import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { and, desc, eq, inArray, ne, notInArray } from "drizzle-orm";
import type { JSONContent } from "@tiptap/core";
import { z } from "zod";
import { db, schema } from "@/db";
import { authorize } from "@/lib/auth/dal";
import { EMPTY_DOC } from "@/lib/content/doc";
import { mdxToDoc } from "@/lib/content/mdx-to-doc";
import { PLACEHOLDER_SLUG, slugify, uniqueSlug } from "@/lib/slug";
import { addToNavigation, NO_NAV, prepareForPublish, readAutomation, resolveSection, type Filled } from "@/lib/automation";
import type { NavigationData, NavItemData } from "@/lib/site-types";

const MAX_REVISIONS = 50;
const MAX_CONTENT_BYTES = 2_000_000;

export type SaveResult = { ok: true; savedAt: string; hasChanges: boolean } | { ok: false; error: string };

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(200, "Slug terlalu panjang.")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/,
    "Gunakan huruf kecil, angka, tanda hubung, dan / untuk sub-folder.",
  );

/** Search/social fields; empty strings are dropped so the page title/description apply. */
const seoSchema = z
  .object({
    title: z.string().trim().max(120, "Meta title terlalu panjang.").optional(),
    description: z.string().trim().max(320, "Meta description terlalu panjang.").optional(),
    image: z
      .string()
      .trim()
      .max(500)
      .refine((v) => v === "" || /^(https?:\/\/|\/(?!\/))/i.test(v), "Gambar harus berupa URL http(s) atau /media/…")
      .optional(),
    noindex: z.boolean().optional(),
  })
  .transform((seo) => Object.fromEntries(Object.entries(seo).filter(([, v]) => v !== "" && v !== undefined && v !== false)));

const draftSchema = z.object({
  title: z.string().trim().max(200, "Judul terlalu panjang."),
  description: z.string().trim().max(500, "Deskripsi terlalu panjang."),
  content: z.custom<JSONContent>(
    (value) =>
      typeof value === "object" &&
      value !== null &&
      (value as JSONContent).type === "doc" &&
      JSON.stringify(value).length <= MAX_CONTENT_BYTES,
    "Konten tidak valid atau terlalu besar.",
  ),
  seo: seoSchema.optional().default({}),
  /** Cover image URL; null or "" removes it. */
  cover: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || /^(https?:\/\/|\/(?!\/))/i.test(v), "Gambar sampul harus berupa URL http(s) atau /media/…")
    .nullable()
    .optional()
    .transform((v) => v || null),
});
type DraftInput = z.input<typeof draftSchema>;
type Draft = z.output<typeof draftSchema>;

const isId = (id: unknown): id is string => z.uuid().safeParse(id).success;
const NOT_FOUND = "Halaman tidak ditemukan.";

async function addRevision(pageId: string, draft: Draft, reason: string, userId: string) {
  await db.insert(schema.pageRevisions).values({
    pageId,
    title: draft.title,
    description: draft.description,
    content: draft.content,
    seo: draft.seo,
    coverImage: draft.cover ?? null,
    reason,
    createdById: userId,
  });
  const keep = db
    .select({ id: schema.pageRevisions.id })
    .from(schema.pageRevisions)
    .where(eq(schema.pageRevisions.pageId, pageId))
    .orderBy(desc(schema.pageRevisions.createdAt))
    .limit(MAX_REVISIONS);
  await db
    .delete(schema.pageRevisions)
    .where(and(eq(schema.pageRevisions.pageId, pageId), notInArray(schema.pageRevisions.id, keep)));
}

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

  const [page] = await db
    .select({ status: schema.pages.status })
    .from(schema.pages)
    .where(eq(schema.pages.id, pageId));
  if (!page) return { ok: false, error: "Halaman tidak ditemukan." };

  const hasChanges = page.status !== "draft";
  const [saved] = await db
    .update(schema.pages)
    .set({
      draftTitle: parsed.data.title,
      draftDescription: parsed.data.description,
      draftContent: parsed.data.content,
      draftSeo: parsed.data.seo,
      draftCoverImage: parsed.data.cover ?? null,
      hasChanges,
      updatedById: user.id,
    })
    .where(eq(schema.pages.id, pageId))
    .returning({ updatedAt: schema.pages.updatedAt });
  if (revision) await addRevision(pageId, parsed.data, "save", user.id);
  return { ok: true, savedAt: saved.updatedAt.toISOString(), hasChanges };
}

type PublishResult =
  | { ok: false; error: string }
  | { ok: true; savedAt: string; hasChanges: false; status: "published" | "scheduled"; publishedAt: string; slug: string; filled: Filled };

/**
 * Publishes a working copy now, or schedules it when `publishAt` is in the
 * future. Re-publishing an already published page updates the live version.
 * Doc pages go through automation first (lib/automation.ts), and a first
 * publish adds the page to the navigation.
 */
async function publishWorkingCopy(pageId: string, input: Draft, publishAt: string | null, userId: string): Promise<PublishResult> {
  if (!input.title) return { ok: false, error: "Beri judul sebelum menerbitkan." };
  const [page] = await db
    .select({
      status: schema.pages.status,
      publishedAt: schema.pages.publishedAt,
      kind: schema.pages.kind,
      slug: schema.pages.slug,
      navSection: schema.pages.navSection,
    })
    .from(schema.pages)
    .where(eq(schema.pages.id, pageId));
  if (!page) return { ok: false, error: NOT_FOUND };

  let status: "published" | "scheduled" = "published";
  let publishedAt = page.status === "published" && page.publishedAt ? page.publishedAt : new Date();
  if (publishAt) {
    const when = new Date(publishAt);
    if (Number.isNaN(when.getTime())) return { ok: false, error: "Tanggal terbit tidak valid." };
    if (when.getTime() > Date.now() + 30_000) {
      if (page.status === "published") {
        return { ok: false, error: "Halaman ini sudah terbit. Batalkan terbit dulu untuk menjadwalkannya." };
      }
      status = "scheduled";
      publishedAt = when;
    }
  }

  const firstPublish = page.status !== "published";
  const settings = await readAutomation();
  let draft: Draft = input;
  let { slug, navSection } = page;
  let filled: Filled = {};
  if (page.kind === "doc") {
    ({ draft, slug, navSection, filled } = await prepareForPublish({ pageId, draft: input, slug, navSection, firstPublish, settings }));
  }

  // A scheduled page keeps its working copy; the scheduler copies it when due.
  const live =
    status === "published"
      ? { title: draft.title, description: draft.description, content: draft.content, seo: draft.seo, coverImage: draft.cover ?? null, hasChanges: false }
      : {};
  const [saved] = await db
    .update(schema.pages)
    .set({
      draftTitle: draft.title,
      draftDescription: draft.description,
      draftContent: draft.content,
      draftSeo: draft.seo,
      draftCoverImage: draft.cover ?? null,
      ...live,
      slug,
      navSection,
      status,
      publishedAt,
      updatedById: userId,
    })
    .where(eq(schema.pages.id, pageId))
    .returning({ updatedAt: schema.pages.updatedAt });
  await addRevision(pageId, draft, status === "published" ? "publish" : "schedule", userId);
  if (status === "published") {
    refreshPublicSite();
    if (page.kind === "doc" && firstPublish && settings.navigation) {
      const added = await addToNavigation(pageId, navSection);
      if (added) {
        filled = { ...filled, section: added };
        updateTag("navigation");
      }
    }
  }
  return {
    ok: true,
    savedAt: saved.updatedAt.toISOString(),
    hasChanges: false,
    status,
    publishedAt: publishedAt.toISOString(),
    slug,
    filled,
  };
}

/** Publishes (or schedules) the editor's working copy. */
export async function publishPage(pageId: string, input: DraftInput, publishAt: string | null): Promise<PublishResult> {
  const user = await authorize();
  if ("error" in user) return { ok: false, error: user.error };
  if (!isId(pageId)) return { ok: false as const, error: NOT_FOUND };
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  return publishWorkingCopy(pageId, parsed.data, publishAt, user.id);
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
  const [page] = await db
    .update(schema.pages)
    .set({ status: "draft", hasChanges: false, updatedById: user.id })
    .where(eq(schema.pages.id, pageId))
    .returning({ updatedAt: schema.pages.updatedAt });
  if (!page) return { ok: false, error: "Halaman tidak ditemukan." };
  refreshPublicSite();
  return { ok: true, savedAt: page.updatedAt.toISOString(), hasChanges: false };
}

/** Discards unpublished edits by copying the live version back into the working copy. */
export async function discardChanges(pageId: string) {
  const user = await authorize();
  if ("error" in user) return { ok: false as const, error: user.error };
  if (!isId(pageId)) return { ok: false as const, error: NOT_FOUND };
  const [page] = await db.select().from(schema.pages).where(eq(schema.pages.id, pageId));
  if (!page) return { ok: false as const, error: "Halaman tidak ditemukan." };
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
  if (!page) return { ok: false as const, error: "Halaman tidak ditemukan." };

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

const aiDraftSchema = z.object({
  title: z.string().trim().min(1, "Judul kosong.").max(200),
  description: z.string().trim().max(500).optional(),
  slug: z.string().trim().max(200).optional(),
  content: z.string().max(60_000),
  seo: z.object({ title: z.string().trim().max(120).optional(), description: z.string().trim().max(320).optional() }).optional(),
  /** Navigation section suggested by the agent ("Tab › Section" or a section title). */
  section: z.string().trim().max(200).optional(),
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
  const { title, description = "", content, mode, publishAt } = parsed.data;
  if (mode === "schedule") {
    const when = publishAt ? new Date(publishAt) : null;
    if (!when || Number.isNaN(when.getTime())) return { ok: false, error: "Tanggal jadwal tidak valid." };
    if (when.getTime() <= Date.now() + 30_000) return { ok: false, error: "Tanggal jadwal sudah lewat. Pilih Buat draf lalu jadwalkan dari editor." };
  }

  const requested = parsed.data.slug ? slugSchema.safeParse(parsed.data.slug.replace(/^\/?docs\//, "")) : null;
  const slug = await uniqueSlug(requested?.success ? requested.data : slugify(title));
  const doc = mdxToDoc(content);
  const seo = Object.fromEntries(Object.entries(parsed.data.seo ?? {}).filter(([, v]) => v));
  const navSection = await resolveSection(parsed.data.section);
  const [page] = await db
    .insert(schema.pages)
    .values({
      slug,
      title,
      description,
      content: doc,
      seo,
      draftTitle: title,
      draftDescription: description,
      draftContent: doc,
      draftSeo: seo,
      navSection,
      authorId: user.id,
      updatedById: user.id,
    })
    .returning({ id: schema.pages.id });
  const draft = { title, description, content: doc, seo, cover: null };
  await addRevision(page.id, draft, "ai", user.id);
  if (mode === "draft") return { ok: true, id: page.id, slug, status: "draft" };

  const result = await publishWorkingCopy(page.id, draft, mode === "schedule" ? (publishAt ?? null) : null, user.id);
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
