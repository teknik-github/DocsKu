import { z } from "zod";
import type { GlossaryTerm } from "@/lib/site-types";

/** AI glossary suggestions (Glosarium → "Usulkan dengan AI"): the reply format and how it is checked. Pure, so it can be tested. */

export type GlossarySuggestion = { term: string; aliases: string[]; definition: string };

export const MAX_SUGGESTIONS = 15;

const suggestion = z.object({
  term: z.string().trim().min(2).max(60),
  aliases: z.array(z.string().trim().min(2).max(60)).max(10).catch([]).default([]),
  definition: z.string().trim().min(3).max(400),
});

const keyOf = (text: string) => text.trim().toLocaleLowerCase("id");

/**
 * Reads the model's JSON (`{"terms":[…]}` or a bare array, possibly wrapped in
 * prose or a code fence) and keeps valid suggestions whose term and aliases
 * aren't already used by the glossary or an earlier suggestion.
 */
export function parseSuggestions(reply: string, existing: GlossaryTerm[]): GlossarySuggestion[] {
  const start = reply.search(/[[{]/);
  if (start < 0) return [];
  const end = Math.max(reply.lastIndexOf("}"), reply.lastIndexOf("]"));
  let json: unknown;
  try {
    json = JSON.parse(reply.slice(start, end + 1));
  } catch {
    return [];
  }
  const list = Array.isArray(json) ? json : Array.isArray((json as { terms?: unknown })?.terms) ? (json as { terms: unknown[] }).terms : [];
  const taken = new Set(existing.flatMap((term) => [term.term, ...term.aliases].map(keyOf)));
  const out: GlossarySuggestion[] = [];
  for (const item of list) {
    const parsed = suggestion.safeParse(item);
    if (!parsed.success) continue;
    const term = parsed.data.term;
    if (taken.has(keyOf(term))) continue;
    const aliases = [...new Map(parsed.data.aliases.filter((alias) => keyOf(alias) !== keyOf(term) && !taken.has(keyOf(alias))).map((alias) => [keyOf(alias), alias])).values()];
    out.push({ term, aliases, definition: parsed.data.definition.replace(/\s+/g, " ") });
    for (const text of [term, ...aliases]) taken.add(keyOf(text));
    if (out.length >= MAX_SUGGESTIONS) break;
  }
  return out;
}

export function suggestionPrompt(existing: GlossaryTerm[], pages: { title: string; markdown: string }[]) {
  const known = existing.map((term) => term.term).join(", ");
  return [
    `Berikut isi dokumentasi (${pages.length} halaman). Pilih hingga ${MAX_SUGGESTIONS} istilah teknis atau singkatan yang benar-benar muncul di teks dan mungkin belum dipahami pembaca pemula.`,
    known ? `Lewati istilah yang sudah ada di glosarium: ${known}.` : "",
    `Untuk tiap istilah tulis definisi 1–2 kalimat (maks. 200 karakter), teks biasa tanpa Markdown, dalam bahasa yang sama dengan dokumentasi. "aliases" berisi sebutan lain yang juga dipakai di teks (boleh kosong).`,
    `Balas HANYA dengan JSON: {"terms":[{"term":"…","aliases":["…"],"definition":"…"}]}`,
    "",
    ...pages.map((page) => `## ${page.title}\n${page.markdown}`),
  ]
    .filter((line, i) => line !== "" || i > 3)
    .join("\n");
}
