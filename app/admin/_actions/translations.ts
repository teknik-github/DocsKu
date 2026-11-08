"use server";

import { updateTag } from "next/cache";
import { forgetRouteExistence } from "@/lib/route-exists";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { authorize } from "@/lib/auth/dal";
import { canEditPage, NO_PAGE_ACCESS } from "@/lib/auth/page-access";
import { logActivity, pageLabel } from "@/lib/activity";
import { LANGUAGE_CODE, RESERVED_CODES, type LanguageSettings } from "@/lib/i18n";
import { type TranslationRow, createTranslation, readLanguages, translateWithAi, translationInfo } from "@/lib/translations";
import { isAiReady } from "@/lib/ai/config";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const isId = (value: unknown) => z.uuid().safeParse(value).success;

/** "Buat terjemahan": a draft copy of the original in `locale` (or the existing one). Editors and admins. */
export async function createPageTranslation(originalId: string, locale: string): Promise<Result<{ id: string }>> {
  const user = await authorize("any");
  if ("error" in user) return { ok: false, error: user.error };
  if (!isId(originalId)) return { ok: false, error: "Halaman tidak ditemukan." };
  if (!(await canEditPage(user, originalId))) return { ok: false, error: NO_PAGE_ACCESS };
  const created = await createTranslation(originalId, locale, user.id);
  if ("error" in created) return { ok: false, error: created.error };
  await logActivity({ user, action: "page.translate", target: { type: "page", id: created.id, label: await pageLabel(created.id) }, meta: { locale, from: originalId, mode: "copy" } });
  return { ok: true, id: created.id };
}

/**
 * "Terjemahkan dengan AI": creates the translation when missing, then fills its
 * working copy with an AI translation of the original. Never publishes.
 */
export async function translatePageWithAi(originalId: string, locale: string): Promise<Result<{ id: string }>> {
  const user = await authorize("any");
  if ("error" in user) return { ok: false, error: user.error };
  if (!isId(originalId)) return { ok: false, error: "Halaman tidak ditemukan." };
  if (!(await canEditPage(user, originalId))) return { ok: false, error: NO_PAGE_ACCESS };
  const created = await createTranslation(originalId, locale, user.id);
  if ("error" in created) return { ok: false, error: created.error };
  // An existing translation someone else wrote is theirs to overwrite.
  if (!(await canEditPage(user, created.id))) return { ok: false, error: NO_PAGE_ACCESS };
  const result = await translateWithAi(created.id, user.id);
  if (!result.ok) return result;
  await logActivity({
    user,
    action: "page.translate",
    target: { type: "page", id: created.id, label: await pageLabel(created.id) },
    meta: { locale, from: originalId, mode: "ai", chunks: result.chunks },
  });
  return { ok: true, id: created.id };
}

const settingsSchema = z.object({
  defaultLocale: z.string().trim().toLowerCase().regex(LANGUAGE_CODE, "Kode bahasa utama tidak valid (contoh: id, en, pt-br)."),
  defaultLabel: z.string().trim().min(1, "Beri nama bahasa utama.").max(40),
  languages: z
    .array(
      z.object({
        code: z.string().trim().toLowerCase().regex(LANGUAGE_CODE, "Kode bahasa tidak valid (contoh: en, ms, pt-br)."),
        label: z.string().trim().min(1, "Beri nama setiap bahasa.").max(40),
      }),
    )
    .max(12, "Paling banyak 12 bahasa tambahan."),
  missing: z.enum(["hide", "fallback"]),
});

/** Pengaturan → Bahasa. Admins only. */
export async function saveLanguageSettings(input: LanguageSettings): Promise<Result> {
  const user = await authorize("admin");
  if ("error" in user) return { ok: false, error: user.error };
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const value = parsed.data;
  const codes = value.languages.map((language) => language.code);
  if (new Set(codes).size !== codes.length) return { ok: false, error: "Setiap bahasa hanya boleh muncul sekali." };
  if (codes.includes(value.defaultLocale)) return { ok: false, error: "Bahasa utama tidak perlu ditambahkan lagi sebagai bahasa tambahan." };
  // Each language gets a home at /<code>; it must not take over a path the site already uses.
  const reserved = codes.find((code) => RESERVED_CODES.includes(code));
  if (reserved) return { ok: false, error: `Kode “${reserved}” sudah dipakai alamat situs (/${reserved}). Pilih kode lain.` };

  const before = await readLanguages();
  if (before.defaultLocale !== value.defaultLocale) {
    // Translations exist in other languages; changing the originals' language would mislabel them.
    const [translated] = await db.select({ id: schema.pages.id }).from(schema.pages).where(eq(schema.pages.locale, value.defaultLocale));
    if (translated) return { ok: false, error: `Sudah ada terjemahan berbahasa “${value.defaultLocale}”, jadi bahasa itu tidak bisa menjadi bahasa utama.` };
  }
  // A language's path (/docs/<code>/…) must not belong to an original page.
  for (const code of codes) {
    const [clash] = await db
      .select({ slug: schema.pages.slug })
      .from(schema.pages)
      .where(and(isNull(schema.pages.translationOf), sql`(${schema.pages.slug} = ${code} or ${schema.pages.slug} like ${`${code}/%`})`));
    if (clash) return { ok: false, error: `Halaman “/docs/${clash.slug}” memakai awalan “${code}”. Ganti slug-nya dulu sebelum menambahkan bahasa ini.` };
  }

  await db
    .insert(schema.settings)
    .values({ key: "languages", value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } });
  // Originals are in the default language.
  if (before.defaultLocale !== value.defaultLocale) {
    await db.update(schema.pages).set({ locale: value.defaultLocale }).where(isNull(schema.pages.translationOf));
  }
  updateTag("settings");
  updateTag("pages");
  updateTag("navigation");
  forgetRouteExistence();
  await logActivity({ user, action: "settings.save", target: { type: "settings", id: "bahasa", label: "Bahasa" }, meta: { section: "languages", languages: codes } });
  return { ok: true };
}

export type PageTranslations = {
  isTranslation: boolean;
  locale: string;
  original: { id: string; title: string; slug: string; status: "draft" | "scheduled" | "published" };
  translations: TranslationRow[];
  languages: { code: string; label: string }[];
  defaultLabel: string;
  aiReady: boolean;
};

/** The editor's "Terjemahan" block: the page's language, its original, and every language's translation. */
export async function getPageTranslations(pageId: string): Promise<PageTranslations | null> {
  const user = await authorize("any");
  if ("error" in user || !isId(pageId)) return null;
  const [info, languages, ai] = await Promise.all([translationInfo(pageId), readLanguages(), isAiReady()]);
  if (!info) return null;
  return { ...info, languages: languages.languages, defaultLabel: languages.defaultLabel, aiReady: ai };
}
