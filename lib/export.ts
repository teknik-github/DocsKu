import "server-only";
import { readFile } from "node:fs/promises";
import { and, asc, eq, inArray, isNull, type SQL } from "drizzle-orm";
import { strToU8, zipSync, type Zippable } from "fflate";
import { db, schema } from "@/db";
import { toMarkdown } from "@/lib/content/markdown";
import { writeFrontmatter } from "@/lib/frontmatter";
import { findCategory, listedIn } from "@/lib/categories";
import { readNavigation } from "@/lib/automation";
import { STORED_NAME, uploadPath } from "@/lib/media";
import { slugify } from "@/lib/slug";
import type { PageSeo } from "@/lib/site-types";

/**
 * "Ekspor dokumentasi" (Pengaturan → Cadangan & ekspor): every doc page as an
 * MDX file with front-matter, one folder per category (`<tab>/<category>/`),
 * plus navigation.json, manifest.json and, optionally, the media files the
 * pages use. The import (lib/import.ts) reads the same format back.
 */

export type ExportOptions = {
  /** "published": live pages only; "all": drafts and scheduled pages too (their working copy). */
  status: "published" | "all";
  internal: boolean;
  translations: boolean;
  media: boolean;
};

export const EXPORT_FORMAT = 1;
const MEDIA_REF = /\/media\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpg|gif|webp|avif))/g;

const folderName = (title: string) => slugify(title) || "kategori";

export async function buildDocsExport(options: ExportOptions): Promise<{ zip: Uint8Array; pages: number; media: number }> {
  const p = schema.pages;
  const where: SQL[] = [eq(p.kind, "doc")];
  if (options.status === "published") where.push(eq(p.status, "published"));
  if (!options.internal) where.push(eq(p.visibility, "public"));
  if (!options.translations) where.push(isNull(p.translationOf));
  const [rows, navigation] = await Promise.all([
    db.select().from(p).where(and(...where)).orderBy(asc(p.slug)),
    readNavigation(),
  ]);
  const listed = listedIn(navigation);
  const slugById = new Map(rows.map((row) => [row.id, row.slug]));
  const originals = rows.some((row) => row.translationOf && !slugById.has(row.translationOf))
    ? await db
        .select({ id: p.id, slug: p.slug })
        .from(p)
        .where(inArray(p.id, rows.flatMap((row) => (row.translationOf ? [row.translationOf] : []))))
    : [];
  for (const original of originals) slugById.set(original.id, original.slug);

  const files: Zippable = {};
  const used = new Set<string>();
  const mediaFiles = new Set<string>();
  const index: { path: string; slug: string; title: string; status: string }[] = [];

  for (const row of rows) {
    const live = row.status === "published";
    const title = (live ? row.title : row.draftTitle) || row.title || row.draftTitle || "Tanpa judul";
    const description = live ? row.description : row.draftDescription;
    const content = live ? row.content : row.draftContent;
    const seo = ((live ? row.seo : row.draftSeo) ?? {}) as PageSeo;
    const cover = live ? row.coverImage : row.draftCoverImage;
    // A translation follows its original's category; it lives under _terjemahan/<locale>/.
    const sectionId = listed.get(row.translationOf ?? row.id) ?? (row.navSection && row.navSection !== "none" ? row.navSection : null);
    const place = sectionId ? findCategory(navigation, sectionId) : null;
    const folder = [
      ...(row.translationOf ? ["_terjemahan", row.locale] : []),
      ...(place ? [folderName(place.tab.title), folderName(place.section.title)] : ["tanpa-kategori"]),
    ].join("/");
    const base = row.slug.split("/").pop() || "halaman";
    let path = `${folder}/${base}.mdx`;
    for (let i = 2; used.has(path); i++) path = `${folder}/${base}-${i}.mdx`;
    used.add(path);

    const body = toMarkdown(content);
    const frontmatter = writeFrontmatter({
      title,
      description,
      slug: row.slug,
      status: row.status,
      visibility: row.visibility,
      locale: row.locale,
      translation_of: row.translationOf ? slugById.get(row.translationOf) : undefined,
      group: place?.tab.title,
      category: place?.section.title,
      featured: row.featured || undefined,
      cover: cover ?? undefined,
      seo_title: seo.title,
      seo_description: seo.description,
      seo_image: seo.image,
      noindex: seo.noindex || undefined,
      published_at: row.publishedAt?.toISOString(),
    });
    files[path] = strToU8(frontmatter + body);
    index.push({ path, slug: row.slug, title, status: row.status });
    if (options.media) {
      for (const text of [body, cover ?? "", seo.image ?? ""]) for (const match of text.matchAll(MEDIA_REF)) mediaFiles.add(match[1]);
    }
  }

  let media = 0;
  for (const name of mediaFiles) {
    if (!STORED_NAME.test(name)) continue;
    try {
      // Images are already compressed: store them as they are.
      files[`media/${name}`] = [new Uint8Array(await readFile(uploadPath(name))), { level: 0 }];
      media++;
    } catch {
      // A page can point at a file that was deleted; the export simply goes without it.
    }
  }

  const pageSlugs = Object.fromEntries(rows.map((row) => [row.id, row.slug]));
  files["navigation.json"] = strToU8(JSON.stringify({ navigation, pages: pageSlugs }, null, 2));
  files["manifest.json"] = strToU8(
    JSON.stringify({ app: "docsku", format: EXPORT_FORMAT, exportedAt: new Date().toISOString(), options, pages: index }, null, 2),
  );
  files["README.md"] = strToU8(
    [
      "# Ekspor dokumentasi Docsku",
      "",
      "Setiap halaman adalah satu berkas `.mdx` dengan front-matter (title, description, slug, status, visibility, locale, kategori).",
      "Folder mengikuti kategori: `<tab>/<kategori>/`. Terjemahan ada di `_terjemahan/<bahasa>/`.",
      "Komponen seperti `<Tip>`, `<Steps>` dan `<Tabs>` adalah blok editor Docsku.",
      "",
      "Impor kembali lewat Dasbor → Halaman → Impor (ZIP ini bisa diunggah apa adanya).",
      "",
    ].join("\n"),
  );

  return { zip: zipSync(files, { level: 6 }), pages: rows.length, media };
}

/** Settings that are safe to hand out: no AI key, no encrypted MCP headers. */
const SAFE_SETTINGS = ["site", "navigation", "home", "home_draft", "automation", "comments", "ask_ai", "review", "languages", "widget", "security"];

/**
 * "Ekspor data lengkap (JSON)": pages (live and working copy), navigation,
 * safe settings, redirects, comments and the team's public profile fields, for
 * archives or moving to another tool. Never password hashes, sessions, TOTP
 * secrets, API tokens, the AI key or MCP server headers. A full restore is
 * `pnpm restore` with a `pnpm backup` archive.
 */
export async function buildJsonExport() {
  const [pages, settings, redirects, comments, users] = await Promise.all([
    db.select().from(schema.pages).orderBy(asc(schema.pages.slug)),
    db.select().from(schema.settings).where(inArray(schema.settings.key, SAFE_SETTINGS)),
    db.select().from(schema.redirects),
    db.select().from(schema.pageComments).orderBy(asc(schema.pageComments.createdAt)),
    db
      .select({
        id: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
        role: schema.users.role,
        username: schema.users.username,
        jobTitle: schema.users.jobTitle,
        bio: schema.users.bio,
        avatar: schema.users.avatar,
        links: schema.users.links,
        createdAt: schema.users.createdAt,
      })
      .from(schema.users),
  ]);
  return {
    app: "docsku",
    format: EXPORT_FORMAT,
    exportedAt: new Date().toISOString(),
    settings: Object.fromEntries(settings.map((row) => [row.key, row.value])),
    pages,
    redirects,
    comments,
    users,
  };
}
