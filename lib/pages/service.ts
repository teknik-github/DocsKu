import "server-only";
import type { JSONContent } from "@tiptap/core";
import { and, desc, eq, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { mdxToDoc } from "@/lib/content/mdx-to-doc";
import { slugify, uniqueSlug } from "@/lib/slug";
import { addToNavigation, prepareForPublish, readAutomation, resolveSection, type Filled } from "@/lib/automation";
import { forgetRedirects } from "@/lib/redirects";
import { forgetRouteExistence } from "@/lib/route-exists";
import { notify } from "@/lib/notify";

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

/** Someone else saved the working copy since the editor loaded it. */
export type Conflict = { version: number; by: string | null; at: string };
export type SaveConflict = { ok: false; error: string; conflict: Conflict };

/** The page's current working-copy version and who saved it last, for conflict messages. */
export async function currentVersion(pageId: string): Promise<Conflict | null> {
  const [row] = await db
    .select({ version: schema.pages.draftVersion, at: schema.pages.updatedAt, by: schema.users.name })
    .from(schema.pages)
    .leftJoin(schema.users, eq(schema.users.id, schema.pages.updatedById))
    .where(eq(schema.pages.id, pageId));
  return row ? { version: row.version, by: row.by, at: row.at.toISOString() } : null;
}

export function conflictError(conflict: Conflict): SaveConflict {
  return { ok: false, error: `Halaman ini diubah oleh ${conflict.by ?? "orang lain"} sejak Anda membukanya.`, conflict };
}

/** Bumps the working-copy version; every write of the draft* columns must include it. */
export const nextDraftVersion = () => sql`${schema.pages.draftVersion} + 1`;

/**
 * Saves the working copy. Visitors keep seeing the live version until the page
 * is (re)published. With `revisionReason` a revision is stored too.
 *
 * With `expectedVersion` (the editor sends the version it loaded) the save only
 * happens when nobody saved in between; otherwise it returns a conflict and
 * changes nothing. `force` overwrites anyway, after keeping the other person's
 * version as a "before-overwrite" revision. Callers without a version (MCP,
 * translations) save unconditionally, as before.
 */
export async function saveWorkingCopy(
  pageId: string,
  draft: Draft,
  userId: string,
  revisionReason?: string,
  options: { expectedVersion?: number; force?: boolean } = {},
): Promise<{ ok: true; savedAt: string; hasChanges: boolean; version: number } | { ok: false; error: string } | SaveConflict> {
  const [page] = await db
    .select({
      status: schema.pages.status,
      version: schema.pages.draftVersion,
      title: schema.pages.draftTitle,
      description: schema.pages.draftDescription,
      content: schema.pages.draftContent,
      seo: schema.pages.draftSeo,
      cover: schema.pages.draftCoverImage,
    })
    .from(schema.pages)
    .where(eq(schema.pages.id, pageId));
  if (!page) return { ok: false as const, error: NOT_FOUND };
  const { expectedVersion, force = false } = options;
  if (expectedVersion !== undefined && expectedVersion !== page.version) {
    if (!force) {
      const conflict = await currentVersion(pageId);
      return conflict ? conflictError(conflict) : { ok: false as const, error: NOT_FOUND };
    }
    // Overwriting someone else's save: keep theirs in the history first.
    await addRevision(pageId, { title: page.title, description: page.description, content: page.content, seo: page.seo, cover: page.cover }, "before-overwrite", userId);
  }
  const hasChanges = page.status !== "draft";
  const versionGuard = expectedVersion !== undefined && !force ? eq(schema.pages.draftVersion, expectedVersion) : undefined;
  const [saved] = await db
    .update(schema.pages)
    .set({
      draftTitle: draft.title,
      draftDescription: draft.description,
      draftContent: draft.content,
      draftSeo: draft.seo,
      draftCoverImage: draft.cover ?? null,
      draftVersion: nextDraftVersion(),
      hasChanges,
      updatedById: userId,
    })
    .where(versionGuard ? and(eq(schema.pages.id, pageId), versionGuard) : eq(schema.pages.id, pageId))
    .returning({ updatedAt: schema.pages.updatedAt, version: schema.pages.draftVersion });
  if (!saved) {
    // Someone saved between the read above and this update.
    const conflict = await currentVersion(pageId);
    return conflict ? conflictError(conflict) : { ok: false as const, error: NOT_FOUND };
  }
  if (revisionReason) await addRevision(pageId, draft, revisionReason, userId);
  return { ok: true as const, savedAt: saved.updatedAt.toISOString(), hasChanges, version: saved.version };
}

export type PublishResult =
  | { ok: false; error: string }
  | SaveConflict
  | { ok: true; savedAt: string; hasChanges: false; status: "published" | "scheduled"; publishedAt: string; slug: string; filled: Filled; version: number };

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
  /** The working-copy version the editor loaded; publishing someone else's newer save is refused. */
  expectedVersion?: number,
): Promise<PublishResult> {
  if (!input.title) return { ok: false, error: "Beri judul sebelum menerbitkan." };
  const [page] = await db
    .select({
      version: schema.pages.draftVersion,
      status: schema.pages.status,
      publishedAt: schema.pages.publishedAt,
      kind: schema.pages.kind,
      slug: schema.pages.slug,
      navSection: schema.pages.navSection,
    })
    .from(schema.pages)
    .where(eq(schema.pages.id, pageId));
  if (!page) return { ok: false, error: NOT_FOUND };
  if (expectedVersion !== undefined && expectedVersion !== page.version) {
    const conflict = await currentVersion(pageId);
    if (conflict) return conflictError(conflict);
  }

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
      ? { title: draft.title, description: draft.description, content: draft.content, seo: draft.seo, coverImage: draft.cover ?? null, hasChanges: false, reviewedAt: sql`now()` }
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
      draftVersion: nextDraftVersion(),
      // Publishing (or scheduling) settles any pending approval request.
      approvalStatus: null,
      approvalNote: null,
      slug,
      navSection,
      status,
      publishedAt,
      updatedById: userId,
    })
    .where(eq(schema.pages.id, pageId))
    .returning({ updatedAt: schema.pages.updatedAt, version: schema.pages.draftVersion });
  await addRevision(pageId, draft, status === "published" ? "publish" : "schedule", userId);
  if (status === "published") {
    invalidate("pages");
    forgetRedirects();
    forgetRouteExistence();
    if (page.kind === "doc" && firstPublish && settings.navigation) {
      const added = await addToNavigation(pageId, navSection);
      if (added) {
        filled = { ...filled, section: added };
        invalidate("navigation");
      }
    }
    // The one place a page.published notification is raised for a person's publish (approvals included).
    if (page.kind === "doc" && firstPublish) {
      const [actor] = await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, userId));
      await notify({ type: "page.published", pageId, title: draft.title, href: `/docs/${slug}`, by: actor?.name ?? "Tim", actorId: userId });
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
    version: saved.version,
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
  forgetRedirects();
  forgetRouteExistence();
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
