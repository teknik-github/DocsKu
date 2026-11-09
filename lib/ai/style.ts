import { z } from "zod";
import type { GlossaryTerm } from "@/lib/site-types";

/**
 * The team's writing style (settings key "ai_style", Pengaturan → Gaya penulisan):
 * voice and rules every AI tool follows, words to avoid (also flagged by the
 * editor's writing checks), and whether glossary terms are the standard terms.
 * The prompt text only changes when an admin saves, so it doesn't break prompt caching.
 */

export type WritingStyle = {
  /** How the docs sound, e.g. "ramah dan lugas, sapa pembaca dengan Anda". */
  voice: string;
  /** Free-form house rules, one per line. */
  rules: string;
  /** Words or phrases to avoid (case-insensitive). */
  avoid: string[];
  /** Use glossary terms as the standard spelling of those terms. */
  useGlossary: boolean;
};

export const DEFAULT_STYLE: WritingStyle = { voice: "", rules: "", avoid: [], useGlossary: true };

export const styleSchema = z.object({
  voice: z.string().trim().max(600, "Nada tulisan maksimal 600 karakter.").default(""),
  rules: z.string().trim().max(2000, "Aturan maksimal 2.000 karakter.").default(""),
  avoid: z
    .array(z.string().trim().min(1).max(60))
    .max(60, "Maksimal 60 kata yang dihindari.")
    .default([])
    .transform((list) => [...new Map(list.map((word) => [word.toLocaleLowerCase("id"), word])).values()]),
  useGlossary: z.boolean().default(true),
});

/** The style as prompt text (empty when nothing is set). */
export function styleGuideText(style: WritingStyle, glossary: GlossaryTerm[] = []): string {
  const parts: string[] = [];
  if (style.voice.trim()) parts.push(`- Nada tulisan: ${style.voice.trim()}`);
  const rules = style.rules
    .split("\n")
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);
  for (const rule of rules) parts.push(`- ${rule}`);
  if (style.avoid.length) parts.push(`- Jangan memakai kata atau frasa ini: ${style.avoid.map((word) => `“${word}”`).join(", ")}.`);
  const terms = style.useGlossary ? glossary.slice(0, 80) : [];
  if (terms.length) {
    parts.push(
      `- Istilah baku situs ini (pakai ejaan dan bentuk ini; sebutan dalam kurung juga boleh): ${terms
        .map((term) => (term.aliases.length ? `${term.term} (${term.aliases.join(", ")})` : term.term))
        .join("; ")}.`,
    );
  }
  return parts.length ? `Gaya penulisan tim (wajib diikuti di semua tulisan):\n${parts.join("\n")}` : "";
}

/** Avoided words found in a text, in the order of the list. */
export function avoidedWordsIn(text: string, avoid: string[]): string[] {
  if (!avoid.length || !text) return [];
  const lower = text.toLocaleLowerCase("id");
  return avoid.filter((word) => {
    const needle = word.toLocaleLowerCase("id");
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "u").test(lower);
  });
}
