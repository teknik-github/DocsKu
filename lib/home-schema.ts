import { z } from "zod";
import { iconNames } from "@/components/icon";
import { isSafeHref, isSafeImage } from "@/lib/home-sections";
import type { HomeSection } from "@/lib/site-types";

/** Validation for the home page sections (settings keys "home" and "home_draft"). */

const text = (max: number) => z.string().trim().max(max);
const href = z.string().trim().max(500).refine(isSafeHref, "Tautan harus diawali /, #, http(s):// atau mailto:");
const image = z.string().trim().max(500).refine(isSafeImage, "Gambar harus dari Media atau URL https.").nullable();
const icon = z.string().refine((v) => iconNames.includes(v), "Ikon tidak dikenal.");
const button = z.object({ label: text(40).min(1, "Isi teks tombol."), href, style: z.enum(["primary", "secondary"]) });
const buttons = z.array(button).max(3);
const columns = z.union([z.literal(2), z.literal(3), z.literal(4)]);

const base = {
  id: z.string().min(1).max(64),
  hidden: z.boolean(),
  width: z.enum(["full", "half"]),
  tone: z.enum(["plain", "muted", "accent"]),
};

export const homeSectionSchema = z.discriminatedUnion("type", [
  z.object({
    ...base,
    type: z.literal("hero"),
    eyebrow: text(80),
    title: text(160),
    subtitle: text(400),
    showSearch: z.boolean(),
    searchLabel: text(80),
    showPopular: z.boolean(),
    image,
    align: z.enum(["center", "left"]),
    buttons,
  }),
  z.object({ ...base, type: z.literal("categories"), title: text(120), columns, links: z.number().int().min(0).max(20), groupByTab: z.boolean() }),
  z.object({
    ...base,
    type: z.literal("articles"),
    title: text(120),
    source: z.enum(["popular", "latest", "featured", "manual"]),
    pages: z.array(z.string().regex(/^\/docs\/[\w/-]+$/)).max(24),
    limit: z.number().int().min(1).max(24),
    style: z.enum(["list", "cards"]),
  }),
  z.object({
    ...base,
    type: z.literal("features"),
    title: text(120),
    subtitle: text(300),
    columns,
    items: z
      .array(z.object({ icon, image, title: text(80).min(1, "Isi judul kartu."), text: text(300), href: z.union([z.literal(""), href]) }))
      .max(12),
  }),
  z.object({ ...base, type: z.literal("textImage"), title: text(160), text: text(3000), image, imageSide: z.enum(["left", "right"]), buttons }),
  z.object({
    ...base,
    type: z.literal("faq"),
    title: text(120),
    items: z.array(z.object({ question: text(200).min(1, "Isi pertanyaan."), answer: text(2000) })).max(30),
  }),
  z.object({ ...base, type: z.literal("stats"), title: text(120), items: z.array(z.object({ value: text(20).min(1, "Isi angka."), label: text(80) })).max(6) }),
  z.object({ ...base, type: z.literal("cta"), title: text(160), text: text(400), buttons }),
  z.object({ ...base, type: z.literal("content"), markdown: text(20_000) }),
]);

export const homeSectionsSchema = z.array(homeSectionSchema).max(30);

/** Stored sections, skipping any that no longer validate; null when nothing was saved yet. */
export function parseHomeSections(value: unknown): HomeSection[] | null {
  const sections = (value as { sections?: unknown } | null | undefined)?.sections;
  if (!Array.isArray(sections)) return null;
  return sections.flatMap((section) => {
    const parsed = homeSectionSchema.safeParse(section);
    return parsed.success ? [parsed.data as HomeSection] : [];
  });
}
