"use server";

import { updateTag } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { authorize } from "@/lib/auth/dal";
import { logActivity } from "@/lib/activity";
import { homeSectionsSchema, parseHomeSections } from "@/lib/home-schema";
import { defaultSections } from "@/lib/home-sections";
import { localizeHomeLinks, translateHomeText } from "@/lib/home-translate";
import { readLanguages } from "@/lib/translations";
import type { HomeSection } from "@/lib/site-types";

/**
 * The home page builder (/admin/home). Every change autosaves the working copy
 * ("home_draft", seen only in the builder's preview); publishing copies it to
 * "home", which visitors see. Same people as the old home editor: any signed-in user.
 *
 * Extra languages (Pengaturan → Bahasa) have their own home at /<code>:
 * settings keys "home:<code>" and "home_draft:<code>", edited with the
 * builder's language switcher (`locale`).
 */

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const keys = (locale: string | null) => (locale ? { live: `home:${locale}`, draft: `home_draft:${locale}` } : { live: "home", draft: "home_draft" });

/** null for the default language, the code for an enabled extra language, or an error. */
async function checkLocale(locale: string | undefined): Promise<{ locale: string | null; label: string } | { error: string }> {
  if (!locale) return { locale: null, label: "Beranda" };
  const languages = await readLanguages();
  const language = languages.languages.find((l) => l.code === locale);
  return language ? { locale: language.code, label: `Beranda ${language.label}` } : { error: "Bahasa itu tidak aktif. Atur di Pengaturan → Bahasa." };
}

async function put(key: string, sections: HomeSection[]) {
  const value = { sections };
  await db.insert(schema.settings).values({ key, value }).onConflictDoUpdate({ target: schema.settings.key, set: { value } });
}

async function read(key: string) {
  const [row] = await db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, key));
  return parseHomeSections(row?.value);
}

function validate(sections: unknown): { sections: HomeSection[] } | { error: string } {
  const parsed = homeSectionsSchema.safeParse(sections);
  if (parsed.success) return { sections: parsed.data as HomeSection[] };
  const issue = parsed.error.issues[0];
  // Name the section, so the message points somewhere: "Bagian 3: Isi teks tombol."
  const index = typeof issue.path[0] === "number" ? issue.path[0] + 1 : null;
  return { error: index ? `Bagian ${index}: ${issue.message}` : issue.message };
}

export async function saveHomeDraft(sections: HomeSection[], locale?: string): Promise<Result<{ savedAt: string }>> {
  const user = await authorize();
  if ("error" in user) return { ok: false, error: user.error };
  const lang = await checkLocale(locale);
  if ("error" in lang) return { ok: false, error: lang.error };
  const checked = validate(sections);
  if ("error" in checked) return { ok: false, error: checked.error };
  await put(keys(lang.locale).draft, checked.sections);
  return { ok: true, savedAt: new Date().toISOString() };
}

export async function publishHome(sections: HomeSection[], locale?: string): Promise<Result> {
  const user = await authorize();
  if ("error" in user) return { ok: false, error: user.error };
  const lang = await checkLocale(locale);
  if ("error" in lang) return { ok: false, error: lang.error };
  const checked = validate(sections);
  if ("error" in checked) return { ok: false, error: checked.error };
  const key = keys(lang.locale);
  await put(key.live, checked.sections);
  await db.delete(schema.settings).where(eq(schema.settings.key, key.draft));
  updateTag("settings");
  await logActivity({
    user,
    action: "home.publish",
    target: { type: "home", id: lang.locale ?? undefined, label: lang.label },
    meta: { sections: checked.sections.length, ...(lang.locale ? { locale: lang.locale } : {}) },
  });
  return { ok: true };
}

export async function discardHomeDraft(locale?: string): Promise<Result> {
  const user = await authorize();
  if ("error" in user) return { ok: false, error: user.error };
  const lang = await checkLocale(locale);
  if ("error" in lang) return { ok: false, error: lang.error };
  await db.delete(schema.settings).where(eq(schema.settings.key, keys(lang.locale).draft));
  await logActivity({ user, action: "home.discard", target: { type: "home", id: lang.locale ?? undefined, label: lang.label }, meta: lang.locale ? { locale: lang.locale } : {} });
  return { ok: true };
}

/**
 * Starts an extra language's home from the default one (its published
 * sections, else the built-in layout): links point at that language, and with
 * `ai` the visible text is translated. Saved as that language's draft only.
 */
export async function startHomeTranslation(locale: string, ai: boolean): Promise<Result<{ sections: HomeSection[] }>> {
  const user = await authorize();
  if ("error" in user) return { ok: false, error: user.error };
  const lang = await checkLocale(locale);
  if ("error" in lang || !lang.locale) return { ok: false, error: "error" in lang ? lang.error : "Pilih bahasa tambahan." };
  const source = (await read("home")) ?? defaultSections();
  let sections = await localizeHomeLinks(source, lang.locale);
  if (ai) {
    const translated = await translateHomeText(sections, lang.locale);
    if (!translated.ok) return translated;
    sections = translated.sections;
  }
  await put(keys(lang.locale).draft, sections);
  await logActivity({ user, action: "home.translate", target: { type: "home", id: lang.locale, label: lang.label }, meta: { ai } });
  return { ok: true, sections };
}
