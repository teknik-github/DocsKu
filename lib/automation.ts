import "server-only";
import type { JSONContent } from "@tiptap/core";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { configReady, getAiConfig } from "@/lib/ai/config";
import { completeChat } from "@/lib/ai/client";
import { toMarkdown } from "@/lib/content/markdown";
import { DEFAULT_AUTOMATION } from "@/lib/data/site";
import { PLACEHOLDER_SLUG, slugify, uniqueSlug } from "@/lib/slug";
import type { AutomationSettings, NavigationData, NavItemData, PageSeo } from "@/lib/site-types";

/**
 * What publishing does on its own (see AutomationSettings): fill in a missing
 * description, meta title/description and slug, pick a navigation section, and
 * add the page to the navigation on its first publish. Nothing here publishes;
 * it only runs when a person publishes or schedules a page.
 */

/** Uncached read, for server actions and route handlers. */
export async function readAutomation(): Promise<AutomationSettings> {
  const [row] = await db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, "automation"));
  return { ...DEFAULT_AUTOMATION, ...(row?.value as Partial<AutomationSettings> | undefined) };
}

export const NO_NAV = "none";

export type NavSectionOption = { id: string; label: string };

async function readNavigation(): Promise<NavigationData> {
  const [row] = await db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, "navigation"));
  return (row?.value as NavigationData | undefined) ?? { tabs: [] };
}

/** Every section as "Tab › Section", in navigation order. */
export function sectionOptions(navigation: NavigationData): NavSectionOption[] {
  return navigation.tabs.flatMap((tab) => tab.sections.map((section) => ({ id: section.id, label: `${tab.title} › ${section.title}` })));
}

function contains(items: NavItemData[], pageId: string): boolean {
  return items.some((item) => (item.type === "page" ? item.pageId === pageId : item.type === "group" && contains(item.items, pageId)));
}

/** The "Tab › Section" a page is listed under, if any. */
export function placementOf(navigation: NavigationData, pageId: string): string | null {
  for (const tab of navigation.tabs) {
    for (const section of tab.sections) if (contains(section.items, pageId)) return `${tab.title} › ${section.title}`;
  }
  return null;
}

/** Navigation data for the editor: where the page is listed and the sections it could go to. */
export async function navigationForEditor(pageId: string) {
  const navigation = await readNavigation();
  return { placement: placementOf(navigation, pageId), sections: sectionOptions(navigation) };
}

/** Finds a section by id, "Tab › Section" label, or section title (case-insensitive). */
export async function resolveSection(value: string | undefined): Promise<string | null> {
  if (!value) return null;
  const wanted = value.trim().toLowerCase();
  const options = sectionOptions(await readNavigation());
  const match =
    options.find((o) => o.id === value) ??
    options.find((o) => o.label.toLowerCase() === wanted) ??
    options.find((o) => o.label.split(" › ")[1]?.toLowerCase() === wanted);
  return match?.id ?? null;
}

/**
 * Appends the page to a section (the first one when `sectionId` is unknown).
 * Returns the "Tab › Section" label, or null if nothing changed.
 */
export async function addToNavigation(pageId: string, sectionId: string | null): Promise<string | null> {
  if (sectionId === NO_NAV) return null;
  const navigation = await readNavigation();
  if (placementOf(navigation, pageId)) return null;
  const options = sectionOptions(navigation);
  const target = options.find((o) => o.id === sectionId) ?? options[0];
  if (!target) return null;
  const next: NavigationData = {
    tabs: navigation.tabs.map((tab) => ({
      ...tab,
      sections: tab.sections.map((section) =>
        section.id === target.id ? { ...section, items: [...section.items, { type: "page", pageId }] } : section,
      ),
    })),
  };
  await db
    .insert(schema.settings)
    .values({ key: "navigation", value: next })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: next } });
  return target.label;
}

// ---- Filling in metadata before publishing ----

export type PublishDraft = { title: string; description: string; content: JSONContent; seo: PageSeo; cover: string | null };

/** What automation changed, reported back to the editor. */
export type Filled = { description?: string; seo?: PageSeo; slug?: string; section?: string };

const metaReply = z.object({
  description: z.string().trim().max(500).optional(),
  seo_title: z.string().trim().max(120).optional(),
  seo_description: z.string().trim().max(320).optional(),
  section: z.string().trim().max(100).optional(),
});

/** One short AI request for everything missing. Returns {} if AI is off or the reply is unusable. */
async function suggestMeta(
  draft: PublishDraft,
  need: { description: boolean; seo: boolean; sections: NavSectionOption[] },
): Promise<z.infer<typeof metaReply>> {
  const config = await getAiConfig();
  if (!configReady(config)) return {};
  const fields = [
    need.description && `"description": satu kalimat ringkasan isi (maks. 160 karakter) yang tampil di bawah judul`,
    need.seo && `"seo_title": meta title 30–60 karakter yang memuat kata kunci utama`,
    need.seo && `"seo_description": meta description 120–160 karakter yang menarik untuk diklik`,
    need.sections.length > 0 &&
      `"section": id bagian navigasi yang paling cocok untuk halaman ini, dipilih dari daftar:\n${need.sections.map((s) => `  - ${s.id}: ${s.label}`).join("\n")}`,
  ].filter(Boolean);
  const markdown = toMarkdown(draft.content).slice(0, 8_000);
  try {
    const reply = await completeChat(
      config,
      [
        {
          role: "system",
          content: "Anda melengkapi metadata halaman dokumentasi. Balas HANYA dengan satu objek JSON, tanpa teks atau blok kode lain. Gunakan bahasa yang sama dengan isi halaman.",
        },
        {
          role: "user",
          content: `Judul: ${draft.title}\n${draft.description ? `Deskripsi: ${draft.description}\n` : ""}Isi (Markdown):\n"""\n${markdown || "(kosong)"}\n"""\n\nKembalikan JSON dengan field:\n${fields.map((f) => `- ${f}`).join("\n")}`,
        },
      ],
      config.thinking ? 2000 : 600,
      25_000,
    );
    const json = reply.slice(reply.indexOf("{"), reply.lastIndexOf("}") + 1);
    const parsed = metaReply.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

/**
 * Fills the gaps in a doc page's working copy before it is published or
 * scheduled. `firstPublish` is true when the page is not live yet; only then is
 * the slug or navigation section decided.
 */
export async function prepareForPublish({
  pageId,
  draft,
  slug,
  navSection,
  firstPublish,
  settings,
}: {
  pageId: string;
  draft: PublishDraft;
  slug: string;
  navSection: string | null;
  firstPublish: boolean;
  settings: AutomationSettings;
}): Promise<{ draft: PublishDraft; slug: string; navSection: string | null; filled: Filled }> {
  const filled: Filled = {};
  const next = { ...draft, seo: { ...draft.seo } };

  if (settings.slug && firstPublish && slug.startsWith(PLACEHOLDER_SLUG)) {
    slug = await uniqueSlug(slugify(draft.title), pageId);
    filled.slug = slug;
  }

  const needDescription = settings.description && !draft.description;
  const needSeo = settings.seo && (!draft.seo.title || !draft.seo.description);
  let sections: NavSectionOption[] = [];
  if (settings.navigation && firstPublish && navSection === null) {
    const navigation = await readNavigation();
    if (!placementOf(navigation, pageId)) sections = sectionOptions(navigation);
  }

  if (needDescription || needSeo || sections.length > 1) {
    const meta = await suggestMeta(next, { description: needDescription, seo: needSeo, sections: sections.length > 1 ? sections : [] });
    if (needDescription && meta.description) next.description = filled.description = meta.description;
    if (needSeo && !next.seo.title && meta.seo_title) next.seo.title = meta.seo_title;
    if (needSeo && !next.seo.description && meta.seo_description) next.seo.description = meta.seo_description;
    if (next.seo.title !== draft.seo.title || next.seo.description !== draft.seo.description) filled.seo = next.seo;
    const picked = sections.find((s) => s.id === meta.section);
    if (picked) navSection = picked.id;
  }
  // Without an AI choice the page goes to the first section; remember it so the editor shows where.
  if (sections.length && navSection === null) navSection = sections[0].id;
  const label = sections.find((s) => s.id === navSection)?.label;
  if (label) filled.section = label;

  return { draft: next, slug, navSection, filled };
}
