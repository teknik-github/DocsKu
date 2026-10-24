import "server-only";
import type { JSONContent } from "@tiptap/core";
import { and, desc, eq, notInArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { mdxToDoc } from "@/lib/content/mdx-to-doc";
import { slugify, uniqueSlug } from "@/lib/slug";
import { addToNavigation, prepareForPublish, readAutomation, resolveSection, type Filled } from "@/lib/automation";

/**
 * Page operations shared by the dashboard's server actions and the MCP
 * endpoint. Callers check who may do what; these only enforce content rules.
 * `invalidate` refreshes cached public data: server actions pass `updateTag`,
 * route handlers `revalidateTag(tag, { expire: 0 })`.
 */

export type Invalidate = (tag: "pages" | "navigation") => void;

const MAX_REVISIONS = 50;
const MAX_CONTENT_BYTES = 2_000_000;
export const NOT_FOUND = "Halaman tidak ditemukan.";

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(200, "Slug terlalu panjang.")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/,
    "Gunakan huruf kecil, angka, tanda hubung, dan / untuk sub-folder.",
  );

/** Search/social fields; empty strings are dropped so the page title/description apply. */
export const seoSchema = z
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

export const draftSchema = z.object({
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
export type DraftInput = z.input<typeof draftSchema>;
export type Draft = z.output<typeof draftSchema>;

export async function addRevision(pageId: string, draft: Draft, reason: string, userId: string) {
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

/**
 * Saves the working copy. Visitors keep seeing the live version until the page
 * is (re)published. With `revisionReason` a revision is stored too.
 */
export async function saveWorkingCopy(pageId: string, draft: Draft, userId: string, revisionReason?: string) {
  const [page] = await db.select({ status: schema.pages.status }).from(schema.pages).where(eq(schema.pages.id, pageId));
  if (!page) return { ok: false as const, error: NOT_FOUND };
  const hasChanges = page.status !== "draft";
  const [saved] = await db
    .update(schema.pages)
    .set({
      draftTitle: draft.title,
      draftDescription: draft.description,
      draftContent: draft.content,
      draftSeo: draft.seo,
      draftCoverImage: draft.cover ?? null,
      hasChanges,
      updatedById: userId,
    })
    .where(eq(schema.pages.id, pageId))
    .returning({ updatedAt: schema.pages.updatedAt });
  if (revisionReason) await addRevision(pageId, draft, revisionReason, userId);
  return { ok: true as const, savedAt: saved.updatedAt.toISOString(), hasChanges };
}

export type PublishResult =
  | { ok: false; error: string }
  | { ok: true; savedAt: string; hasChanges: false; status: "published" | "scheduled"; publishedAt: string; slug: string; filled: Filled };

/**
 * Publishes a working copy now, or schedules it when `publishAt` is in the
 * future. Re-publishing an already published page updates the live version.
 * Doc pages go through automation first (lib/automation.ts), and a first
 * publish adds the page to the navigation.
 */
export async function publishWorkingCopy(
  pageId: string,
  input: Draft,
  publishAt: string | null,
  userId: string,
  invalidate: Invalidate,
): Promise<PublishResult> {
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
    invalidate("pages");
    if (page.kind === "doc" && firstPublish && settings.navigation) {
      const added = await addToNavigation(pageId, navSection);
      if (added) {
        filled = { ...filled, section: added };
        invalidate("navigation");
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

/** Takes the page off the site (or cancels a schedule); content is kept. */
export async function unpublish(pageId: string, userId: string, invalidate: Invalidate) {
  const [page] = await db
    .update(schema.pages)
    .set({ status: "draft", hasChanges: false, updatedById: userId })
    .where(eq(schema.pages.id, pageId))
    .returning({ updatedAt: schema.pages.updatedAt });
  if (!page) return { ok: false as const, error: NOT_FOUND };
  invalidate("pages");
  return { ok: true as const, savedAt: page.updatedAt.toISOString(), hasChanges: false };
}

export const markdownPageSchema = z.object({
  title: z.string().trim().min(1, "Judul kosong.").max(200),
  description: z.string().trim().max(500).optional(),
  slug: z.string().trim().max(200).optional(),
  content: z.string().max(60_000),
  seo: z.object({ title: z.string().trim().max(120).optional(), description: z.string().trim().max(320).optional() }).optional(),
  /** Navigation section for the first publish ("Tab › Section", a section title, or an id). */
  section: z.string().trim().max(200).optional(),
});

/**
 * Creates a draft doc page from Markdown/MDX (converted here, never trusted as
 * TipTap JSON from the caller). `reason` labels the first revision.
 */
export async function createPageFromMarkdown(input: z.output<typeof markdownPageSchema>, userId: string, reason: string) {
  const { title, description = "", content } = input;
  const requested = input.slug ? slugSchema.safeParse(input.slug.replace(/^\/?docs\//, "")) : null;
  const slug = await uniqueSlug(requested?.success ? requested.data : slugify(title));
  const doc = mdxToDoc(content);
  const seo = Object.fromEntries(Object.entries(input.seo ?? {}).filter(([, v]) => v));
  const navSection = await resolveSection(input.section);
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
      authorId: userId,
      updatedById: userId,
    })
    .returning({ id: schema.pages.id });
  const draft: Draft = { title, description, content: doc, seo, cover: null };
  await addRevision(page.id, draft, reason, userId);
  return { id: page.id, slug, draft };
}
