"use server";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { authorize } from "@/lib/auth/dal";
import { logActivity } from "@/lib/activity";
import { DEFAULT_GLOSSARY } from "@/lib/data/site";
import type { GlossarySettings, GlossaryTerm } from "@/lib/site-types";

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
