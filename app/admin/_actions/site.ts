"use server";

import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import { updateTag } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { authorize } from "@/lib/auth/dal";
import { logActivity } from "@/lib/activity";
import { STORED_NAME, uploadPath } from "@/lib/media";
import { isCoverColor } from "@/lib/cover-palette";
import { COLOR_THEME_IDS } from "@/lib/color-themes";
import { isCategoryImage } from "@/lib/categories";
import { DOCS_LAYOUT_IDS } from "@/lib/docs-layouts";
import type { AutomationSettings, DocsLayout, NavigationData, SiteSettings } from "@/lib/site-types";

type Result = { ok: true } | { ok: false; error: string };

/** Site-relative paths or http(s) URLs only. */
const href = z
  .string()
  .trim()
  .min(1, "Tautan wajib diisi.")
  .max(500)
  .refine((v) => /^(https?:\/\/|mailto:|\/(?!\/)|#)/i.test(v), "Tautan harus diawali /, #, http(s)://, atau mailto:");
const label = z.string().trim().min(1, "Judul wajib diisi.").max(120);
const link = z.object({ title: label, href, description: z.string().trim().max(200).optional() });

const siteSchema = z.object({
  layout: z.enum(DOCS_LAYOUT_IDS).default("docs"),
  name: z.string().trim().min(1, "Nama situs wajib diisi.").max(60),
  description: z.string().trim().max(300),
  headerCta: z.object({ title: label, href }).nullable(),
  resources: z.array(link).max(20),
  footer: z.array(z.object({ title: label, links: z.array(link).max(20) })).max(6),
});

async function readSite(): Promise<Partial<SiteSettings>> {
  const [row] = await db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, "site"));
  return (row?.value as Partial<SiteSettings> | undefined) ?? {};
}

async function writeSite(value: Partial<SiteSettings>) {
  await db
    .insert(schema.settings)
    .values({ key: "site", value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } });
  updateTag("settings");
}

export async function saveSiteSettings(input: SiteSettings): Promise<Result> {
  const user = await authorize("admin");
  if ("error" in user) return { ok: false, error: user.error };
  const parsed = siteSchema.omit({ layout: true }).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  // The layout and colours are chosen on the Tema page; keep whatever is active.
  const stored = await readSite();
  await writeSite({
    ...parsed.data,
    layout: stored.layout ?? "docs",
    ...(stored.colorTheme ? { colorTheme: stored.colorTheme } : {}),
    ...(stored.showAuthors !== undefined ? { showAuthors: stored.showAuthors } : {}),
  });
  await logActivity({ user, action: "settings.save", target: { type: "settings", id: "umum", label: "Umum" } });
  return { ok: true };
}

export async function saveTheme(layout: DocsLayout): Promise<Result> {
  const user = await authorize("admin");
  if ("error" in user) return { ok: false, error: user.error };
  const parsed = z.enum(DOCS_LAYOUT_IDS).safeParse(layout);
  if (!parsed.success) return { ok: false, error: "Tema tidak dikenal." };
  await writeSite({ ...(await readSite()), layout: parsed.data });
  await logActivity({ user, action: "theme.layout", target: { type: "theme", id: parsed.data, label: parsed.data } });
  return { ok: true };
}

/** Colours for the whole site and dashboard (Tema → Warna). */
export async function saveColorTheme(colorTheme: string): Promise<Result> {
  const user = await authorize("admin");
  if ("error" in user) return { ok: false, error: user.error };
  const parsed = z.enum(COLOR_THEME_IDS).safeParse(colorTheme);
  if (!parsed.success) return { ok: false, error: "Tema warna tidak dikenal." };
  await writeSite({ ...(await readSite()), colorTheme: parsed.data });
  await logActivity({ user, action: "theme.color", target: { type: "theme", id: parsed.data, label: parsed.data } });
  return { ok: true };
}

/** Tema → Penulis: the byline, the author box and /penulis pages. */
export async function saveShowAuthors(show: boolean): Promise<Result> {
  const user = await authorize("admin");
  if ("error" in user) return { ok: false, error: user.error };
  if (typeof show !== "boolean") return { ok: false, error: "Pilihan tidak valid." };
  await writeSite({ ...(await readSite()), showAuthors: show });
  updateTag("authors");
  await logActivity({ user, action: "theme.authors", target: { type: "theme", id: "authors", label: show ? "tampil" : "disembunyikan" }, meta: { show } });
  return { ok: true };
}

const automationSchema = z.object({
  navigation: z.boolean(),
  slug: z.boolean(),
  description: z.boolean(),
  seo: z.boolean(),
  cover: z.boolean(),
  coverColor: z.string().trim().refine(isCoverColor, "Warna sampul tidak valid."),
});

/** What publishing does on its own; see lib/automation.ts. */
export async function saveAutomation(input: AutomationSettings): Promise<Result> {
  const user = await authorize("admin");
  if ("error" in user) return { ok: false, error: user.error };
  const parsed = automationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  await db
    .insert(schema.settings)
    .values({ key: "automation", value: parsed.data })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: parsed.data } });
  // Generated covers show up on cards, so the cached pages change too.
  updateTag("settings");
  updateTag("pages");
  await logActivity({ user, action: "settings.save", target: { type: "settings", id: "otomatisasi", label: "Otomatisasi" } });
  return { ok: true };
}

type NavItemInput =
  | { type: "page"; pageId: string; title?: string }
  | { type: "link"; title: string; href: string }
  | { type: "group"; title: string; items: NavItemInput[] };

const categoryImage = z.string().trim().max(500).refine(isCategoryImage, "Gambar kategori harus dari Media atau URL https.");

const navItem: z.ZodType<NavItemInput> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({ type: z.literal("page"), pageId: z.uuid(), title: z.string().trim().max(120).optional() }),
    z.object({ type: z.literal("link"), title: label, href }),
    z.object({ type: z.literal("group"), title: label, items: z.array(navItem).max(100) }),
  ]),
);

/** Tab and section titles in other languages: { en: "Guides" }. Empty values are dropped. */
const titlesSchema = z
  .record(z.string().regex(/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/), z.string().trim().max(80))
  .optional()
  .transform((titles) => {
    const kept = Object.entries(titles ?? {}).filter(([, title]) => title);
    return kept.length ? Object.fromEntries(kept) : undefined;
  });

const navigationSchema = z.object({
  tabs: z
    .array(
      z.object({
        id: z.string().max(64).optional(),
        title: label,
        titles: titlesSchema,
        sections: z
          .array(z.object({ id: z.string().max(64).optional(), title: label, titles: titlesSchema, image: categoryImage.optional(), items: z.array(navItem).max(200) }))
          .max(50),
      }),
    )
    .max(12),
});

export async function saveNavigation(input: NavigationData): Promise<Result> {
  const user = await authorize("admin");
  if ("error" in user) return { ok: false, error: user.error };
  const parsed = navigationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const value: NavigationData = {
    tabs: parsed.data.tabs.map((tab) => ({
      id: tab.id || randomUUID(),
      title: tab.title,
      ...(tab.titles ? { titles: tab.titles } : {}),
      sections: tab.sections.map((section) => ({
        id: section.id || randomUUID(),
        title: section.title,
        ...(section.titles ? { titles: section.titles } : {}),
        // The category image is set in Halaman; keep it through navigation edits.
        ...(section.image ? { image: section.image } : {}),
        items: section.items,
      })),
    })),
  };
  await db
    .insert(schema.settings)
    .values({ key: "navigation", value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } });
  updateTag("navigation");
  await logActivity({ user, action: "navigation.save", target: { type: "navigation", label: "Navigasi" } });
  return { ok: true };
}

/** Removes an uploaded image. Pages that still use it will show a broken image. */
export async function deleteMedia(id: string): Promise<Result> {
  const user = await authorize();
  if ("error" in user) return { ok: false, error: user.error };
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Media tidak ditemukan." };
  const [row] = await db.delete(schema.media).where(eq(schema.media.id, id)).returning({ filename: schema.media.filename, originalName: schema.media.originalName });
  if (!row) return { ok: false, error: "Media tidak ditemukan." };
  await logActivity({ user, action: "media.delete", target: { type: "media", id, label: row.originalName }, meta: { file: row.filename } });
  if (STORED_NAME.test(row.filename)) {
    await unlink(uploadPath(row.filename)).catch(() => {});
  }
  return { ok: true };
}
