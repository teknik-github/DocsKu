import "server-only";
import { randomUUID } from "node:crypto";
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
  await writeNavigation(next);
  return target.label;
}

async function writeNavigation(next: NavigationData) {
  await db
    .insert(schema.settings)
    .values({ key: "navigation", value: next })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: next } });
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Finds or creates the section `title` in the tab `tabTitle` (the tab is
 * created too when missing). Returns its id. Empty sections stay off the site
 * until a published page is added to them.
 */
export async function ensureSection(tabTitle: string, title: string): Promise<string> {
  const navigation = await readNavigation();
  const tab = navigation.tabs.find((t) => same(t.title, tabTitle));
  const existing = tab?.sections.find((section) => same(section.title, title));
  if (existing) return existing.id;
  const section = { id: randomUUID(), title: title.trim(), items: [] };
  const tabs = tab
    ? navigation.tabs.map((t) => (t === tab ? { ...t, sections: [...t.sections, section] } : t))
    : [...navigation.tabs, { id: randomUUID(), title: tabTitle.trim(), sections: [section] }];
  await writeNavigation({ tabs });
  return section.id;
}

/** Used when the navigation has no section at all and AI didn't name one. */
const FALLBACK_SECTION = { tab: "Dokumentasi", title: "Umum" };

// ---- Filling in metadata before publishing ----

export type PublishDraft = { title: string; description: string; content: JSONContent; seo: PageSeo; cover: string | null };

/** What automation changed, reported back to the editor. */
export type Filled = { description?: string; seo?: PageSeo; slug?: string; section?: string };

const metaReply = z.object({
  description: z.string().trim().max(500).optional(),
  seo_title: z.string().trim().max(120).optional(),
  seo_description: z.string().trim().max(320).optional(),
  section: z.string().trim().max(100).optional(),
  new_section: z
    .object({ tab: z.string().trim().min(1).max(60), title: z.string().trim().min(1).max(60) })
    .optional()
    .catch(undefined),
});

/** One short AI request for everything missing. Returns {} if AI is off or the reply is unusable. */
async function suggestMeta(
  draft: PublishDraft,
  need: { description: boolean; seo: boolean; section: boolean; sections: NavSectionOption[]; tabs: string[] },
): Promise<z.infer<typeof metaReply>> {
  const config = await getAiConfig();
  if (!configReady(config)) return {};
  const fields = [
    need.description && `"description": satu kalimat ringkasan isi (maks. 160 karakter) yang tampil di bawah judul`,
    need.seo && `"seo_title": meta title 30–60 karakter yang memuat kata kunci utama`,
    need.seo && `"seo_description": meta description 120–160 karakter yang menarik untuk diklik`,
    need.section &&
      (need.sections.length
        ? `"section": id bagian navigasi yang paling cocok untuk halaman ini, dipilih dari daftar:\n${need.sections.map((s) => `  - ${s.id}: ${s.label}`).join("\n")}\n  Kalau tidak ada yang cocok, kosongkan "section" dan isi "new_section"`
        : `"new_section": navigasi masih kosong, jadi buat bagian pertama untuk halaman ini`),
    need.section &&
      `"new_section" (hanya bila perlu): {"tab": nama tab${need.tabs.length ? ` (pakai yang ada bila cocok: ${need.tabs.join(", ")})` : ""}, "title": judul bagian baru, 1–3 kata, umum agar halaman lain sejenis bisa masuk}`,
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
  // First publish without a chosen section: AI picks one, or names a new one when none fits.
  let sections: NavSectionOption[] = [];
  let tabs: string[] = [];
  let needSection = false;
  if (settings.navigation && firstPublish && navSection === null) {
    const navigation = await readNavigation();
    if (!placementOf(navigation, pageId)) {
      needSection = true;
      sections = sectionOptions(navigation);
      tabs = navigation.tabs.map((tab) => tab.title);
    }
  }

  let newSection: { tab: string; title: string } | undefined;
  if (needDescription || needSeo || needSection) {
    const meta = await suggestMeta(next, { description: needDescription, seo: needSeo, section: needSection, sections, tabs });
    if (needDescription && meta.description) next.description = filled.description = meta.description;
    if (needSeo && !next.seo.title && meta.seo_title) next.seo.title = meta.seo_title;
    if (needSeo && !next.seo.description && meta.seo_description) next.seo.description = meta.seo_description;
    if (next.seo.title !== draft.seo.title || next.seo.description !== draft.seo.description) filled.seo = next.seo;
    const picked = sections.find((s) => s.id === meta.section);
    if (picked) navSection = picked.id;
    else if (needSection) newSection = meta.new_section;
  }
  if (needSection && navSection === null) {
    // Without an AI choice the page goes to the first section (or a fallback one when there is none).
    if (newSection || !sections.length) {
      const wanted = newSection ?? FALLBACK_SECTION;
      navSection = await ensureSection(wanted.tab, wanted.title);
      sections = sectionOptions(await readNavigation());
    } else navSection = sections[0].id;
  }
  // Remember it so the editor shows where.
  const label = needSection ? sections.find((s) => s.id === navSection)?.label : undefined;
  if (label) filled.section = label;

  return { draft: next, slug, navSection, filled };
}
