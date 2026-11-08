"use server";

import { and, desc, eq, lt } from "drizzle-orm";
import { z } from "zod";
import type { JSONContent } from "@tiptap/core";
import { db, schema } from "@/db";
import { authorize } from "@/lib/auth/dal";
import { toMarkdown } from "@/lib/content/markdown";
import { diffField, diffText, type DiffBlock, type FieldDiff } from "@/lib/revision-diff";
import type { PageSeo } from "@/lib/site-types";

/** What a revision is compared with: the editor's working copy, the live (published) version, or the revision before it. */
export type CompareAgainst = "draft" | "live" | "previous";

type Snapshot = { title: string; description: string; content: JSONContent; seo: PageSeo; cover: string | null };

export type CompareResult =
  | {
      ok: true;
      /** Older side, shown on the left / as "−". */
      left: { label: string; at: string | null };
      right: { label: string; at: string | null };
      fields: FieldDiff[];
      blocks: DiffBlock[];
      added: number;
      removed: number;
      tooLarge: boolean;
    }
  | { ok: false; error: string };

const fieldsOf = (a: Snapshot, b: Snapshot): FieldDiff[] =>
  [
    diffField("Judul", a.title, b.title),
    diffField("Deskripsi", a.description, b.description),
    diffField("Judul SEO", a.seo?.title ?? "", b.seo?.title ?? ""),
    diffField("Deskripsi SEO", a.seo?.description ?? "", b.seo?.description ?? ""),
    diffField("Gambar SEO", a.seo?.image ?? "", b.seo?.image ?? ""),
    diffField("Sembunyikan dari mesin pencari", a.seo?.noindex ? "Ya" : "Tidak", b.seo?.noindex ? "Ya" : "Tidak"),
    diffField("Gambar sampul", a.cover ?? "", b.cover ?? ""),
  ].filter((f): f is FieldDiff => f !== null);

/** Compares a revision with the working copy, the live version, or the previous revision. */
export async function compareRevision(pageId: string, revisionId: string, against: CompareAgainst): Promise<CompareResult> {
  const user = await authorize();
  if ("error" in user) return { ok: false, error: user.error };
  if (!z.uuid().safeParse(pageId).success || !z.uuid().safeParse(revisionId).success) return { ok: false, error: "Revisi tidak ditemukan." };
  const r = schema.pageRevisions;
  const [revision] = await db
    .select()
    .from(r)
    .where(and(eq(r.id, revisionId), eq(r.pageId, pageId)));
  if (!revision) return { ok: false, error: "Revisi tidak ditemukan." };
  const fromRevision = (row: typeof revision): Snapshot => ({
    title: row.title,
    description: row.description,
    content: row.content,
    seo: row.seo ?? {},
    cover: row.coverImage,
  });

  let left: Snapshot;
  let right: Snapshot;
  let leftMeta: { label: string; at: string | null };
  let rightMeta: { label: string; at: string | null };
  const revisionMeta = { label: "Revisi ini", at: revision.createdAt.toISOString() };

  if (against === "previous") {
    const [previous] = await db
      .select()
      .from(r)
      .where(and(eq(r.pageId, pageId), lt(r.createdAt, revision.createdAt)))
      .orderBy(desc(r.createdAt))
      .limit(1);
    if (!previous) return { ok: false, error: "Ini revisi tertua; tidak ada revisi sebelumnya." };
    left = fromRevision(previous);
    leftMeta = { label: "Revisi sebelumnya", at: previous.createdAt.toISOString() };
    right = fromRevision(revision);
    rightMeta = revisionMeta;
  } else {
    const [page] = await db.select().from(schema.pages).where(eq(schema.pages.id, pageId));
    if (!page) return { ok: false, error: "Halaman tidak ditemukan." };
    if (against === "live") {
      if (page.status === "draft") return { ok: false, error: "Halaman ini belum pernah terbit." };
      right = { title: page.title, description: page.description, content: page.content, seo: page.seo ?? {}, cover: page.coverImage };
      rightMeta = { label: page.status === "scheduled" ? "Versi terjadwal" : "Versi terbit", at: page.publishedAt?.toISOString() ?? null };
    } else {
      right = { title: page.draftTitle, description: page.draftDescription, content: page.draftContent, seo: page.draftSeo ?? {}, cover: page.draftCoverImage };
      rightMeta = { label: "Draf saat ini", at: page.updatedAt.toISOString() };
    }
    left = fromRevision(revision);
    leftMeta = revisionMeta;
  }

  const body = diffText(toMarkdown(left.content), toMarkdown(right.content));
  return { ok: true, left: leftMeta, right: rightMeta, fields: fieldsOf(left, right), ...body };
}
