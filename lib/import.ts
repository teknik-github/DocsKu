import "server-only";
import type { Role } from "@/db/schema";
import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import { unzipSync } from "fflate";
import { db, schema } from "@/db";
import { mdxToDoc } from "@/lib/content/mdx-to-doc";
import { parseFrontmatter, type Frontmatter } from "@/lib/frontmatter";
import { addRevision, slugSchema, type Draft } from "@/lib/pages/service";
import { ensureSection, readNavigation, writeNavigation } from "@/lib/automation";
import { findCategory, placePages } from "@/lib/categories";
import { detectImage, IMAGE_TYPES, MAX_UPLOAD_BYTES, mediaUrl, uploadDir, uploadPath, type ImageExt } from "@/lib/media";
import { slugify, uniqueSlug } from "@/lib/slug";
import { readLanguages } from "@/lib/translations";
import type { PageSeo } from "@/lib/site-types";

/**
 * Import (Halaman → Impor): Markdown/MDX files or a ZIP (GitBook, Notion
 * "Markdown & CSV", Docusaurus/Mintlify folders, or a Docsku export) become
 * draft pages. Two steps: `parseUpload` reads the files, keeps them in a temp
 * folder and returns a preview; `runImport` creates the drafts with the
 * choices from the preview (titles, slugs, category). Never publishes.
 */

export const IMPORT_LIMITS = {
  uploadBytes: 50 * 1024 * 1024,
  files: 500,
  /** Total uncompressed size of the processed ZIP entries (decompression-bomb guard). */
  unzippedBytes: 200 * 1024 * 1024,
  markdownBytes: 2 * 1024 * 1024,
};

const MARKDOWN = /\.(md|mdx|markdown)$/i;
const IMAGE = /\.(png|jpe?g|gif|webp|avif)$/i;
/** Docs tools' own files that aren't pages. */
const SKIP_NAMES = /^(summary\.md|_sidebar\.md|_navbar\.md|changelog\.md\.bak)$/i;
const BUNDLE_TTL_MS = 2 * 60 * 60 * 1000;

export type ImportItem = {
  key: string;
  /** Path inside the upload, after cleaning (Notion ids removed). */
  path: string;
  title: string;
  slug: string;
  description: string;
  /** Category the file asks for: front-matter group/category, or its top folder (sub-folders only shape the slug). */
  group: string | null;
  category: string | null;
  locale: string | null;
  translationOf: string | null;
  visibility: "public" | "internal";
  order: number | null;
  images: number;
  warnings: string[];
};

type StoredItem = ImportItem & { body: string; frontmatter: Frontmatter; originalPath: string };
type Bundle = { id: string; userId: string; createdAt: number; ownExport: boolean; items: StoredItem[]; images: Record<string, string> };

export type ImportPreview = { id: string; items: ImportItem[]; ownExport: boolean; skipped: string[] };

const bundleRoot = () => path.join(os.tmpdir(), "docsku-import");

/** Rejects absolute paths, "..", hidden files and macOS metadata; returns a clean relative path or null. */
function safePath(name: string): string | null {
  const parts = name.replace(/\\/g, "/").split("/").filter((part) => part !== "" && part !== ".");
  if (!parts.length || /^[a-z]:$/i.test(parts[0]) || name.startsWith("/")) return null;
  if (parts.some((part) => part === ".." || part.startsWith(".") || part === "__MACOSX")) return null;
  return parts.join("/");
}

/** Notion appends a 32-character id to every file and folder name: "Mulai cepat 3f2a…e1.md". */
const stripNotionId = (segment: string) => segment.replace(/\s+[0-9a-f]{32}(?=(\.[a-z0-9]+)?$)/i, "");

const humanize = (name: string) => {
  const text = name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return text ? text[0].toUpperCase() + text.slice(1) : "Tanpa judul";
};

type RawEntry = { path: string; bytes: Uint8Array };

/** Files from the upload form: loose .md/.mdx/images and ZIPs (unpacked with the limits above). */
export function collectEntries(files: { name: string; bytes: Uint8Array }[]): { entries: RawEntry[]; skipped: string[] } | { error: string } {
  const entries: RawEntry[] = [];
  const skipped: string[] = [];
  let unzipped = 0;
  for (const file of files) {
    if (/\.zip$/i.test(file.name)) {
      let tooBig = false;
      let unpacked: Record<string, Uint8Array>;
      try {
        unpacked = unzipSync(file.bytes, {
          filter: (entry) => {
            const clean = safePath(entry.name);
            if (!clean || entry.name.endsWith("/")) return false;
            if (!MARKDOWN.test(clean) && !IMAGE.test(clean) && clean !== "manifest.json") return false;
            unzipped += entry.originalSize;
            if (unzipped > IMPORT_LIMITS.unzippedBytes) tooBig = true;
            return !tooBig;
          },
        });
      } catch {
        return { error: `ZIP “${file.name}” tidak bisa dibuka.` };
      }
      if (tooBig) return { error: "Isi ZIP terlalu besar (maksimal 200 MB setelah diekstrak)." };
      for (const [name, bytes] of Object.entries(unpacked)) {
        const clean = safePath(name);
        if (clean) entries.push({ path: clean, bytes });
      }
    } else {
      const clean = safePath(file.name);
      if (clean && (MARKDOWN.test(clean) || IMAGE.test(clean))) entries.push({ path: clean, bytes: file.bytes });
      else skipped.push(file.name);
    }
  }
  if (entries.length > IMPORT_LIMITS.files) return { error: `Terlalu banyak berkas (${entries.length}); maksimal ${IMPORT_LIMITS.files}.` };
  return { entries, skipped };
}

/**
 * Drops a folder that only wraps the export ("Export-…/", "docs/", "repo-main/"),
 * so the folders inside it become categories. A single folder holding pages
 * directly ("Panduan/a.md") is kept: it is the category.
 */
function stripCommonRoot(entries: RawEntry[]): RawEntry[] {
  const firsts = new Set(entries.map((entry) => (entry.path.includes("/") ? entry.path.split("/")[0] : "")));
  if (firsts.size !== 1 || firsts.has("")) return entries;
  const root = [...firsts][0];
  const wrapper = /^(export[-_ ].*|docs?|content|pages|src|site|website|[\w.-]+-(main|master))$/i.test(stripNotionId(root));
  const pagesDirectlyInRoot = entries.some((entry) => MARKDOWN.test(entry.path) && entry.path.split("/").length === 2);
  if (!wrapper && pagesDirectlyInRoot) return entries;
  return entries.map((entry) => ({ ...entry, path: entry.path.slice(root.length + 1) }));
}

const decoder = new TextDecoder();

/** Markdown links and images: `[t](u)`, `![a](u "t")`, plus `<img src="u">`. */
const LINK = /(!?)\[([^\]]*)\]\(\s*<?([^)\s>]+)>?((?:\s+"[^"]*")?)\s*\)/g;
const IMG_TAG = /(<img\b[^>]*?\bsrc=)(["'])([^"']+)\2/gi;

function resolveRelative(fromFile: string, target: string): string | null {
  if (/^([a-z][a-z0-9+.-]*:|\/\/|#|\/)/i.test(target)) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(target.split(/[?#]/)[0]);
  } catch {
    decoded = target.split(/[?#]/)[0];
  }
  if (!decoded) return null;
  const joined = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), decoded));
  return joined.startsWith("..") ? null : joined;
}

/** Removes MDX `import …`/`export …` lines (Docusaurus, Mintlify), but never inside fenced code. */
function dropMdxEsm(body: string): string {
  let fence: string | null = null;
  return body
    .split("\n")
    .filter((line) => {
      const marker = line.match(/^\s*(`{3,}|~{3,})/);
      if (marker) {
        if (!fence) fence = marker[1][0];
        else if (marker[1][0] === fence) fence = null;
        return true;
      }
      return fence !== null || !/^(import|export)\s.+/.test(line);
    })
    .join("\n");
}

function suggestSlug(cleanPath: string): string {
  const parts = cleanPath.replace(MARKDOWN, "").split("/").map((part) => slugify(part));
  // "folder/README.md" and "folder/index.md" are the folder's own page.
  if (parts.length > 1 && /^(readme|index)$/.test(parts[parts.length - 1])) parts.pop();
  return parts.filter(Boolean).join("/") || "halaman";
}

/** Reads the upload into a temp bundle and returns what the import would create. */
export async function parseUpload(files: { name: string; bytes: Uint8Array }[], userId: string): Promise<ImportPreview | { error: string }> {
  const collected = collectEntries(files);
  if ("error" in collected) return collected;
  const ownExport = collected.entries.some((entry) => entry.path.endsWith("manifest.json") && decoder.decode(entry.bytes).includes('"app": "docsku"'));
  const entries = stripCommonRoot(collected.entries.filter((entry) => entry.path !== "manifest.json" && !entry.path.endsWith("/manifest.json")));
  const skipped = [...collected.skipped];

  // Cleaned path (Notion ids removed) ↔ original path, for links written with either.
  const cleanOf = new Map<string, string>();
  for (const entry of entries) cleanOf.set(entry.path, entry.path.split("/").map(stripNotionId).join("/"));
  const byPath = new Map<string, RawEntry>();
  for (const entry of entries) {
    byPath.set(entry.path, entry);
    byPath.set(cleanOf.get(entry.path)!, entry);
  }

  const id = randomUUID();
  const dir = path.join(bundleRoot(), id);
  await mkdir(dir, { recursive: true });
  await purgeOldBundles(id);

  const images: Record<string, string> = {};
  let imageCount = 0;
  const items: StoredItem[] = [];
  const markdownEntries = entries.filter((entry) => MARKDOWN.test(entry.path));
  const markdownPaths = new Set(markdownEntries.map((entry) => entry.path));

  for (const entry of entries) {
    if (!IMAGE.test(entry.path)) continue;
    if (entry.bytes.length > MAX_UPLOAD_BYTES || !detectImage(entry.bytes)) continue;
    const file = `img-${imageCount++}`;
    await writeFile(path.join(dir, file), entry.bytes);
    images[entry.path] = file;
    images[cleanOf.get(entry.path)!] = file;
  }

  for (const entry of markdownEntries) {
    const cleanPath = cleanOf.get(entry.path)!;
    const name = cleanPath.split("/").pop()!;
    if (SKIP_NAMES.test(name) || (ownExport && name.toLowerCase() === "readme.md" && !cleanPath.includes("/"))) {
      skipped.push(cleanPath);
      continue;
    }
    if (entry.bytes.length > IMPORT_LIMITS.markdownBytes) {
      skipped.push(`${cleanPath} (lebih dari 2 MB)`);
      continue;
    }
    const warnings: string[] = [];
    const { data, body: rawBody } = parseFrontmatter(decoder.decode(entry.bytes));
    let body = rawBody;
    let title = typeof data.title === "string" ? data.title.trim() : "";
    if (!title) {
      // A leading "# Title" becomes the page title and leaves the body.
      const heading = body.match(/^\s*#\s+(.+?)\s*#*\s*(?:\r?\n|$)/);
      if (heading) {
        title = heading[1].trim();
        body = body.slice(heading[0].length);
      } else {
        title = humanize(stripNotionId(name));
        warnings.push("Judul diambil dari nama berkas.");
      }
    }
    const withoutEsm = dropMdxEsm(body);
    if (withoutEsm !== body) {
      body = withoutEsm;
      warnings.push("Baris import/export MDX diabaikan.");
    }

    let missingImages = 0;
    let imageRefs = 0;
    const targets = [...body.matchAll(LINK)].filter((m) => m[1] === "!").map((m) => m[3]).concat([...body.matchAll(IMG_TAG)].map((m) => m[3]));
    for (const target of targets) {
      const media = target.match(/^\/media\/([\w-]+\.\w+)$/);
      const resolved = media ? `media/${media[1]}` : resolveRelative(entry.path, target);
      if (!resolved) continue; // External image: left as it is.
      imageRefs++;
      // A /media/… file missing here may still exist on this site; checked when importing.
      if (!media && !images[resolved] && !images[resolved.split("/").map(stripNotionId).join("/")]) missingImages++;
    }
    if (missingImages) warnings.push(`${missingImages} gambar tidak ada di unggahan.`);

    const frontSlug = typeof data.slug === "string" ? slugSchema.safeParse(data.slug.replace(/^\/?(docs\/)?/, "").replace(/\/$/, "")) : null;
    if (frontSlug && !frontSlug.success) warnings.push("Slug di front-matter tidak valid; dibuat ulang.");
    const folders = cleanPath.split("/").slice(0, -1);
    const order = typeof data.sidebar_position === "number" ? data.sidebar_position : typeof data.order === "number" ? data.order : typeof data.position === "number" ? data.position : null;
    items.push({
      key: String(items.length),
      path: cleanPath,
      originalPath: entry.path,
      title: title.slice(0, 200),
      slug: frontSlug?.success ? frontSlug.data : suggestSlug(cleanPath),
      description: typeof data.description === "string" ? data.description.slice(0, 500) : "",
      group: typeof data.group === "string" ? data.group : null,
      // A Docsku export says the category in the front-matter; its "tanpa-kategori/" folder means none.
      category:
        typeof data.category === "string"
          ? data.category
          : ownExport || !folders.length || /^(tanpa-kategori|uncategori[sz]ed)$/i.test(folders[0])
            ? null
            : humanize(folders[0]),
      locale: typeof data.locale === "string" ? data.locale : null,
      translationOf: typeof data.translation_of === "string" ? data.translation_of : null,
      visibility: data.visibility === "internal" ? "internal" : "public",
      order,
      images: imageRefs,
      warnings,
      body,
      frontmatter: data,
    });
  }

  // Suggested slugs: unique inside the upload and against existing pages.
  const taken = new Set<string>();
  for (const item of items) {
    let slug = item.slug;
    const translation = item.translationOf && item.locale;
    for (let i = 2; taken.has(slug) || (!translation && (await uniqueSlug(slug)) !== slug) || (translation && (await slugExists(slug))); i++) {
      slug = `${item.slug}-${i}`;
    }
    if (slug !== item.slug) item.warnings.push(`Slug “${item.slug}” sudah dipakai; diganti “${slug}”.`);
    item.slug = slug;
    taken.add(slug);
  }
  for (const item of items) if (!markdownPaths.has(item.originalPath)) skipped.push(item.path);

  if (!items.length) {
    await rm(dir, { recursive: true, force: true });
    return { id, ownExport, skipped, items: [] };
  }
  const bundle: Bundle = { id, userId, createdAt: Date.now(), ownExport, items, images };
  await writeFile(path.join(dir, "bundle.json"), JSON.stringify(bundle));
  return { id, ownExport, skipped, items: items.map(toPreviewItem) };
}

function toPreviewItem(item: StoredItem): ImportItem {
  const { key, path: itemPath, title, slug, description, group, category, locale, translationOf, visibility, order, images, warnings } = item;
  return { key, path: itemPath, title, slug, description, group, category, locale, translationOf, visibility, order, images, warnings };
}

async function slugExists(slug: string) {
  const [row] = await db.select({ id: schema.pages.id }).from(schema.pages).where(eq(schema.pages.slug, slug));
  return Boolean(row);
}

async function purgeOldBundles(keep: string) {
  try {
    for (const name of await readdir(bundleRoot())) {
      if (name === keep) continue;
      const info = await stat(path.join(bundleRoot(), name)).catch(() => null);
      if (info && Date.now() - info.mtimeMs > BUNDLE_TTL_MS) await rm(path.join(bundleRoot(), name), { recursive: true, force: true });
    }
  } catch {
    // Nothing to clean yet.
  }
}

async function readBundle(id: string, userId: string): Promise<Bundle | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  try {
    const bundle = JSON.parse(await readFile(path.join(bundleRoot(), id, "bundle.json"), "utf8")) as Bundle;
    return bundle.userId === userId && Date.now() - bundle.createdAt < BUNDLE_TTL_MS ? bundle : null;
  } catch {
    return null;
  }
}

export async function discardImport(id: string, userId: string) {
  if (await readBundle(id, userId)) await rm(path.join(bundleRoot(), id), { recursive: true, force: true });
}

export type ImportChoices = {
  items: { key: string; include: boolean; title: string; slug: string }[];
  /** "auto": front-matter group/category, else the top folder (inside `tab`); "section": all into one category; "none". */
  category: { mode: "auto"; tab: string } | { mode: "section"; sectionId: string } | { mode: "none" };
};

export type ImportResult = {
  created: { id: string; title: string; slug: string; category: string | null; warnings: string[] }[];
  images: number;
  sections: string[];
};

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Creates the drafts. `canCreateCategories` is false for editors: they can only use existing categories. */
export async function runImport(
  id: string,
  choices: ImportChoices,
  user: { id: string; role: Role },
): Promise<ImportResult | { error: string }> {
  const found = await readBundle(id, user.id);
  if (!found) return { error: "Unggahan sudah kedaluwarsa. Unggah berkasnya lagi." };
  const bundle: Bundle = found;
  const wanted = new Map(choices.items.filter((choice) => choice.include).map((choice) => [choice.key, choice]));
  const items = bundle.items.filter((item) => wanted.has(item.key));
  if (!items.length) return { error: "Pilih minimal satu halaman." };
  const canCreateCategories = user.role === "admin";
  const languages = await readLanguages();
  const enabled = new Set(languages.languages.map((language) => language.code));

  // Final titles and slugs (validated again: the preview could have been edited).
  const plan: (StoredItem & { finalTitle: string; finalSlug: string; warnings: string[] })[] = [];
  const used = new Set<string>();
  for (const item of items) {
    const choice = wanted.get(item.key)!;
    const parsed = slugSchema.safeParse(choice.slug.replace(/^\/?(docs\/)?/, ""));
    let base = parsed.success && parsed.data ? parsed.data : item.slug;
    const warnings = [...item.warnings.filter((w) => !w.startsWith("Slug “"))];
    const isTranslation = Boolean(item.translationOf && item.locale && item.locale !== languages.defaultLocale && enabled.has(item.locale));
    if (!isTranslation && enabled.has(base.split("/")[0])) base = base.split("/").slice(1).join("/") || "halaman";
    let slug = base;
    for (let i = 2; used.has(slug) || (isTranslation ? await slugExists(slug) : (await uniqueSlug(slug)) !== slug); i++) slug = `${base}-${i}`;
    if (slug !== base) warnings.push(`Slug “${base}” sudah dipakai; diganti “${slug}”.`);
    used.add(slug);
    plan.push({ ...item, finalTitle: (choice.title || item.title).trim().slice(0, 200) || "Tanpa judul", finalSlug: slug, warnings });
  }

  // Links between imported files point at their new addresses.
  const slugByPath = new Map<string, string>();
  for (const item of plan) {
    slugByPath.set(item.originalPath, item.finalSlug);
    slugByPath.set(item.path, item.finalSlug);
    slugByPath.set(item.originalPath.replace(MARKDOWN, ""), item.finalSlug);
    slugByPath.set(item.path.replace(MARKDOWN, ""), item.finalSlug);
  }

  // Images: uploaded once each, into the media library.
  const dir = path.join(bundleRoot(), bundle.id);
  const uploaded = new Map<string, string>();
  let imageCount = 0;
  const existingMedia = new Set(
    (await db.select({ filename: schema.media.filename }).from(schema.media)).map((row) => row.filename),
  );
  async function imageUrl(fromPath: string, target: string): Promise<string | null> {
    const media = target.match(/^\/media\/([\w-]+\.\w+)$/);
    if (media && existingMedia.has(media[1])) return null; // Same site: the file is already here.
    const key = media ? `media/${media[1]}` : resolveRelative(fromPath, target);
    if (!key) return null;
    const file = bundle.images[key] ?? bundle.images[key.split("/").map(stripNotionId).join("/")];
    if (!file) return null;
    if (uploaded.has(file)) return uploaded.get(file)!;
    const bytes = new Uint8Array(await readFile(path.join(dir, file)));
    const ext = detectImage(bytes) as ImageExt | null;
    if (!ext) return null;
    const filename = `${randomUUID()}.${ext}`;
    await mkdir(uploadDir(), { recursive: true });
    await writeFile(uploadPath(filename), bytes, { flag: "wx" });
    await db.insert(schema.media).values({
      filename,
      originalName: path.posix.basename(key).slice(0, 200),
      mimeType: IMAGE_TYPES[ext],
      size: bytes.length,
      uploadedById: user.id,
    });
    imageCount++;
    uploaded.set(file, mediaUrl(filename));
    return mediaUrl(filename);
  }

  async function rewrite(item: StoredItem, text: string): Promise<string> {
    const replacements: [string, string][] = [];
    for (const match of text.matchAll(LINK)) {
      const [whole, bang, label, target, title] = match;
      if (bang) {
        const url = await imageUrl(item.originalPath, target);
        if (url) replacements.push([whole, `![${label}](${url}${title})`]);
        continue;
      }
      const resolved = resolveRelative(item.originalPath, target);
      if (!resolved) continue;
      const anchor = target.includes("#") ? `#${target.split("#")[1]}` : "";
      const slug =
        slugByPath.get(resolved) ??
        slugByPath.get(resolved.replace(MARKDOWN, "")) ??
        slugByPath.get(resolved.split("/").map(stripNotionId).join("/")) ??
        slugByPath.get(`${resolved}/README.md`) ??
        slugByPath.get(`${resolved}/index.md`);
      if (slug) replacements.push([whole, `[${label}](/docs/${slug}${anchor})`]);
    }
    for (const match of text.matchAll(IMG_TAG)) {
      const url = await imageUrl(item.originalPath, match[3]);
      if (url) replacements.push([match[0], `${match[1]}${match[2]}${url}${match[2]}`]);
    }
    let out = text;
    for (const [from, to] of replacements) out = out.split(from).join(to);
    return out;
  }

  // Categories.
  let navigation = await readNavigation();
  const sectionFor = new Map<string, string | null>();
  const createdSections: string[] = [];
  async function categoryOf(item: StoredItem, warnings: string[]): Promise<string | null> {
    if (choices.category.mode === "none") return null;
    if (choices.category.mode === "section") return findCategory(navigation, choices.category.sectionId) ? choices.category.sectionId : null;
    const tab = item.group ?? choices.category.tab.trim() ?? "Dokumentasi";
    const title = item.category;
    if (!title) return null;
    const key = `${tab}\u0000${title}`;
    if (sectionFor.has(key)) return sectionFor.get(key)!;
    const existing = navigation.tabs.find((t) => same(t.title, tab))?.sections.find((s) => same(s.title, title));
    let sectionId: string | null = existing?.id ?? null;
    if (!sectionId && canCreateCategories) {
      sectionId = await ensureSection(tab || "Dokumentasi", title);
      navigation = await readNavigation();
      createdSections.push(`${tab} › ${title}`);
    } else if (!sectionId) {
      warnings.push(`Kategori “${title}” belum ada; hanya admin yang bisa membuatnya.`);
    }
    sectionFor.set(key, sectionId);
    return sectionId;
  }

  // Originals first, so translations can find them; then by sidebar position and path.
  plan.sort((a, b) => Number(Boolean(a.translationOf)) - Number(Boolean(b.translationOf)) || (a.order ?? 1e9) - (b.order ?? 1e9) || a.path.localeCompare(b.path));
  const idBySourceSlug = new Map<string, string>();
  const created: ImportResult["created"] = [];
  const placements = new Map<string, string[]>();

  for (const item of plan) {
    const warnings = item.warnings;
    const fm = item.frontmatter;
    const body = await rewrite(item, item.body);
    const content = mdxToDoc(body);
    const description = item.description;
    const seo: PageSeo = Object.fromEntries(
      Object.entries({
        title: typeof fm.seo_title === "string" ? fm.seo_title : undefined,
        description: typeof fm.seo_description === "string" ? fm.seo_description : undefined,
        image: typeof fm.seo_image === "string" ? ((await imageUrl(item.originalPath, fm.seo_image)) ?? fm.seo_image) : undefined,
        noindex: fm.noindex === true ? true : undefined,
      }).filter(([, value]) => value !== undefined),
    );
    const coverSource = typeof fm.cover === "string" && /^(https:\/\/|\/media\/)/.test(fm.cover) ? fm.cover : null;
    const cover = coverSource ? ((await imageUrl(item.originalPath, coverSource)) ?? coverSource) : null;

    // A translation of a page in this import (or already on the site), in an enabled language.
    let translationOf: string | null = null;
    let locale = languages.defaultLocale;
    let visibility = item.visibility;
    if (item.translationOf && item.locale && item.locale !== languages.defaultLocale) {
      const originalId =
        idBySourceSlug.get(item.translationOf) ??
        (
          await db
            .select({ id: schema.pages.id })
            .from(schema.pages)
            .where(and(eq(schema.pages.slug, item.translationOf), eq(schema.pages.kind, "doc"), isNull(schema.pages.translationOf)))
        )[0]?.id;
      const [already] = originalId
        ? await db.select({ id: schema.pages.id }).from(schema.pages).where(and(eq(schema.pages.translationOf, originalId), eq(schema.pages.locale, item.locale)))
        : [];
      if (originalId && enabled.has(item.locale) && !already && item.finalSlug.startsWith(`${item.locale}/`)) {
        translationOf = originalId;
        locale = item.locale;
        const [original] = await db.select({ visibility: schema.pages.visibility }).from(schema.pages).where(eq(schema.pages.id, originalId));
        visibility = original?.visibility ?? visibility;
      } else {
        warnings.push(`Diimpor sebagai halaman biasa: terjemahan ${item.locale} untuk “${item.translationOf}” tidak bisa dibuat.`);
      }
    }

    const sectionId = translationOf ? null : await categoryOf(item, warnings);
    const [page] = await db
      .insert(schema.pages)
      .values({
        slug: item.finalSlug,
        title: item.finalTitle,
        description,
        content,
        seo,
        coverImage: cover,
        draftTitle: item.finalTitle,
        draftDescription: description,
        draftContent: content,
        draftSeo: seo,
        draftCoverImage: cover,
        visibility,
        locale,
        translationOf,
        featured: fm.featured === true,
        navSection: translationOf ? "none" : sectionId,
        authorId: user.id,
        updatedById: user.id,
      })
      .returning({ id: schema.pages.id });
    const draft: Draft = { title: item.finalTitle, description, content, seo, cover };
    await addRevision(page.id, draft, "import", user.id);
    if (typeof fm.slug === "string") idBySourceSlug.set(fm.slug.replace(/^\/?(docs\/)?/, ""), page.id);
    idBySourceSlug.set(item.slug, page.id);
    if (sectionId) placements.set(sectionId, [...(placements.get(sectionId) ?? []), page.id]);
    const place = sectionId ? findCategory(navigation, sectionId) : null;
    created.push({ id: page.id, title: item.finalTitle, slug: item.finalSlug, category: place ? `${place.tab.title} › ${place.section.title}` : null, warnings });
  }

  // List the drafts in their categories (they stay off the site until published).
  if (placements.size) {
    navigation = await readNavigation();
    for (const [sectionId, ids] of placements) navigation = placePages(navigation, ids, sectionId);
    await writeNavigation(navigation);
  }

  await rm(dir, { recursive: true, force: true });
  return { created, images: imageCount, sections: createdSections };
}
