"use server";

import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { updateTag } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { authorize } from "@/lib/auth/dal";
import { logActivity } from "@/lib/activity";
import { DEFAULT_GLOSSARY } from "@/lib/data/site";
import type { GlossarySettings, GlossaryTerm } from "@/lib/site-types";
import { configReady, getAiConfig } from "@/lib/ai/config";
import { completeChat } from "@/lib/ai/client";
import { toMarkdown } from "@/lib/content/markdown";
import { parseSuggestions, suggestionPrompt, type GlossarySuggestion } from "@/lib/glossary-suggest";

type Result = { ok: true; glossary: GlossarySettings } | { ok: false; error: string };

/** Glossary (settings key "glossary"): editors and admins. Saved terms show on /glosarium and as tooltips in articles. */

const MAX_TERMS = 500;

const termSchema = z.object({
  term: z.string().trim().min(2, "Istilah minimal 2 karakter.").max(60, "Istilah maksimal 60 karakter."),
  aliases: z
    .array(z.string().trim().min(2, "Sebutan lain minimal 2 karakter.").max(60, "Sebutan lain maksimal 60 karakter."))
    .max(10, "Maksimal 10 sebutan lain.")
    .default([]),
  definition: z.string().trim().min(3, "Definisi wajib diisi.").max(400, "Definisi maksimal 400 karakter."),
});

async function readGlossary(): Promise<GlossarySettings> {
  const [row] = await db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, "glossary"));
  return { ...DEFAULT_GLOSSARY, ...((row?.value as Partial<GlossarySettings> | undefined) ?? {}) };
}

async function writeGlossary(value: GlossarySettings) {
  await db
    .insert(schema.settings)
    .values({ key: "glossary", value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } });
  updateTag("settings");
}

const keyOf = (text: string) => text.trim().toLocaleLowerCase("id");

/** Another term already uses this word (as its term or an alias)? */
function clash(terms: GlossaryTerm[], candidate: { term: string; aliases: string[] }, exceptId?: string) {
  const taken = new Map<string, string>();
  for (const term of terms) {
    if (term.id === exceptId) continue;
    for (const text of [term.term, ...term.aliases]) taken.set(keyOf(text), term.term);
  }
  for (const text of [candidate.term, ...candidate.aliases]) {
    const owner = taken.get(keyOf(text));
    if (owner) return `“${text}” sudah dipakai oleh istilah “${owner}”.`;
  }
  return null;
}

/** Adds a term, or updates one when `id` is given. */
export async function saveGlossaryTerm(input: { id?: string; term: string; aliases?: string[]; definition: string }): Promise<Result> {
  const user = await authorize("glossary.manage");
  if ("error" in user) return { ok: false, error: user.error };
  const parsed = termSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  // Drop duplicates and aliases equal to the term itself.
  const aliases = [...new Map(parsed.data.aliases.filter((alias) => keyOf(alias) !== keyOf(parsed.data.term)).map((alias) => [keyOf(alias), alias])).values()];
  const glossary = await readGlossary();
  const problem = clash(glossary.terms, { term: parsed.data.term, aliases }, input.id);
  if (problem) return { ok: false, error: problem };

  let terms: GlossaryTerm[];
  let action: "glossary.create" | "glossary.update";
  let id: string;
  if (input.id) {
    if (!glossary.terms.some((term) => term.id === input.id)) return { ok: false, error: "Istilah tidak ditemukan." };
    id = input.id;
    terms = glossary.terms.map((term) => (term.id === id ? { id, term: parsed.data.term, aliases, definition: parsed.data.definition } : term));
    action = "glossary.update";
  } else {
    if (glossary.terms.length >= MAX_TERMS) return { ok: false, error: `Glosarium maksimal ${MAX_TERMS} istilah.` };
    id = randomUUID().slice(0, 8);
    terms = [...glossary.terms, { id, term: parsed.data.term, aliases, definition: parsed.data.definition }];
    action = "glossary.create";
  }
  const next = { ...glossary, terms };
  await writeGlossary(next);
  await logActivity({ user, action, target: { type: "glossary", id, label: parsed.data.term } });
  return { ok: true, glossary: next };
}

export async function deleteGlossaryTerm(id: string): Promise<Result> {
  const user = await authorize("glossary.manage");
  if ("error" in user) return { ok: false, error: user.error };
  const glossary = await readGlossary();
  const term = glossary.terms.find((t) => t.id === id);
  if (!term) return { ok: false, error: "Istilah tidak ditemukan." };
  const next = { ...glossary, terms: glossary.terms.filter((t) => t.id !== id) };
  await writeGlossary(next);
  await logActivity({ user, action: "glossary.delete", target: { type: "glossary", id, label: term.term } });
  return { ok: true, glossary: next };
}

/** Turns the article tooltips on or off (the /glosarium page stays). */
export async function setGlossaryTooltips(tooltips: boolean): Promise<Result> {
  const user = await authorize("glossary.manage");
  if ("error" in user) return { ok: false, error: user.error };
  const next = { ...(await readGlossary()), tooltips: Boolean(tooltips) };
  await writeGlossary(next);
  await logActivity({ user, action: "glossary.settings", meta: { tooltips: next.tooltips } });
  return { ok: true, glossary: next };
}

/** How much of the docs the AI reads for suggestions. */
const SUGGEST_PAGES = 40;
const SUGGEST_PAGE_CHARS = 2_500;
const SUGGEST_TOTAL_CHARS = 40_000;

/**
 * Glosarium → "Usulkan dengan AI": terms from the published docs that readers may not know,
 * with definitions. Nothing is saved; the person picks which ones to add.
 */
export async function suggestGlossaryTerms(): Promise<{ ok: true; suggestions: GlossarySuggestion[] } | { ok: false; error: string }> {
  const user = await authorize("glossary.manage");
  if ("error" in user) return { ok: false, error: user.error };
  const config = await getAiConfig();
  if (!configReady(config)) return { ok: false, error: "AI belum diatur. Isi API key di Pengaturan → AI." };
  const rows = await db
    .select({ title: schema.pages.title, content: schema.pages.content })
    .from(schema.pages)
    .where(and(eq(schema.pages.status, "published"), eq(schema.pages.kind, "doc"), eq(schema.pages.visibility, "public"), isNull(schema.pages.translationOf)))
    .orderBy(desc(schema.pages.publishedAt))
    .limit(SUGGEST_PAGES);
  if (!rows.length) return { ok: false, error: "Belum ada halaman terbit untuk dibaca AI." };
  let budget = SUGGEST_TOTAL_CHARS;
  const pages = rows.flatMap((row) => {
    if (budget <= 0) return [];
    const markdown = toMarkdown(row.content).slice(0, Math.min(SUGGEST_PAGE_CHARS, budget));
    budget -= markdown.length;
    return [{ title: row.title, markdown }];
  });
  const glossary = await readGlossary();
  try {
    const reply = await completeChat(
      config,
      [
        { role: "system", content: "Anda menyusun glosarium untuk situs dokumentasi. Balas HANYA dengan satu objek JSON, tanpa teks lain." },
        { role: "user", content: suggestionPrompt(glossary.terms, pages) },
      ],
      config.thinking ? 6000 : 2500,
      90_000,
    );
    const suggestions = parseSuggestions(reply, glossary.terms);
    if (!suggestions.length) return { ok: false, error: "AI tidak menemukan istilah baru. Coba lagi nanti, atau tambahkan istilah secara manual." };
    return { ok: true, suggestions };
  } catch (error) {
    return { ok: false, error: `AI gagal menjawab: ${(error as Error).message}` };
  }
}

/** Adds several terms at once (picked from the AI suggestions); clashing ones are skipped and reported. */
export async function addGlossaryTerms(items: { term: string; aliases?: string[]; definition: string }[]): Promise<(Result & { added?: number; skipped?: string[] })> {
  const user = await authorize("glossary.manage");
  if ("error" in user) return { ok: false, error: user.error };
  if (!Array.isArray(items) || items.length === 0 || items.length > 50) return { ok: false, error: "Pilih istilah yang ingin ditambahkan." };
  const glossary = await readGlossary();
  const terms = [...glossary.terms];
  const skipped: string[] = [];
  for (const item of items) {
    const parsed = termSchema.safeParse(item);
    if (!parsed.success) {
      skipped.push(String(item?.term ?? ""));
      continue;
    }
    const aliases = [...new Map(parsed.data.aliases.filter((alias) => keyOf(alias) !== keyOf(parsed.data.term)).map((alias) => [keyOf(alias), alias])).values()];
    if (terms.length >= MAX_TERMS || clash(terms, { term: parsed.data.term, aliases })) {
      skipped.push(parsed.data.term);
      continue;
    }
    terms.push({ id: randomUUID().slice(0, 8), term: parsed.data.term, aliases, definition: parsed.data.definition });
  }
  const added = terms.length - glossary.terms.length;
  if (added === 0) return { ok: false, error: "Tidak ada istilah yang bisa ditambahkan (semuanya sudah ada atau tidak valid)." };
  const next = { ...glossary, terms };
  await writeGlossary(next);
  await logActivity({ user, action: "glossary.create", target: { type: "glossary", id: "ai", label: `${added} istilah dari usulan AI` }, meta: { added, via: "ai" } });
  return { ok: true, glossary: next, added, skipped };
}
