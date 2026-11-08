import type { JSONContent } from "@tiptap/core";
import type { GlossaryTerm } from "@/lib/site-types";

/**
 * Glossary tooltips: marks the first use of each glossary term (or one of its
 * aliases) in an article with a `glossary` mark that the renderer shows as a
 * dotted term with its definition on hover/focus. Works on the stored TipTap
 * JSON before rendering, so every docs layout gets it without changes, and
 * never touches what is saved.
 *
 * Skipped: headings, code (inline and blocks), links, hero/card attributes and
 * text that already carries a glossary mark. Matches whole words only, without
 * regard to case.
 */

export type GlossaryMarkAttrs = { id: string; term: string; definition: string };

/** Nodes whose text never gets tooltips. */
const SKIP_NODES = new Set(["heading", "codeBlock", "codeGroup", "hero"]);
/** Marks that make a text run unsuitable (inline code, a link the reader would click). */
const SKIP_MARKS = new Set(["code", "link", "glossary"]);

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

type Matcher = { regex: RegExp; byText: Map<string, GlossaryTerm> };

function matcher(terms: GlossaryTerm[]): Matcher | null {
  const byText = new Map<string, GlossaryTerm>();
  for (const term of terms) {
    for (const text of [term.term, ...term.aliases]) {
      const key = text.trim().toLocaleLowerCase("id");
      if (key.length >= 2 && !byText.has(key)) byText.set(key, term);
    }
  }
  if (byText.size === 0) return null;
  // Longest first, so "Docker Compose" wins over "Docker".
  const alternatives = [...byText.keys()].sort((a, b) => b.length - a.length).map(escape);
  return { regex: new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alternatives.join("|")})(?![\\p{L}\\p{N}_])`, "giu"), byText };
}

/** A copy of `doc` with the first use of each term marked; `doc` itself is returned when nothing matches. */
export function applyGlossary(doc: JSONContent, terms: GlossaryTerm[]): JSONContent {
  const match = matcher(terms);
  if (!match) return doc;
  const used = new Set<string>();
  let changed = false;

  const splitText = (node: JSONContent): JSONContent[] => {
    const text = node.text ?? "";
    if (!text || (node.marks ?? []).some((mark) => SKIP_MARKS.has(mark.type))) return [node];
    const parts: JSONContent[] = [];
    let last = 0;
    match.regex.lastIndex = 0;
    for (let found = match.regex.exec(text); found; found = match.regex.exec(text)) {
      const term = match.byText.get(found[0].toLocaleLowerCase("id"));
      if (!term || used.has(term.id)) continue;
      used.add(term.id);
      if (found.index > last) parts.push({ ...node, text: text.slice(last, found.index) });
      const attrs: GlossaryMarkAttrs = { id: term.id, term: term.term, definition: term.definition };
      parts.push({ ...node, text: found[0], marks: [...(node.marks ?? []), { type: "glossary", attrs }] });
      last = found.index + found[0].length;
    }
    if (parts.length === 0) return [node];
    if (last < text.length) parts.push({ ...node, text: text.slice(last) });
    changed = true;
    return parts;
  };

  const walk = (node: JSONContent): JSONContent => {
    if (SKIP_NODES.has(node.type ?? "") || !node.content) return node;
    const content = node.content.flatMap((child) => (child.type === "text" ? splitText(child) : [walk(child)]));
    return { ...node, content };
  };

  const result = walk(doc);
  return changed ? result : doc;
}
