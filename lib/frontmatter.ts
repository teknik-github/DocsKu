/**
 * The small YAML front-matter subset used by the docs export and understood
 * by the import: one `key: value` per line; values are double-quoted JSON
 * strings, single-quoted or bare strings, booleans or numbers. Nested YAML
 * (lists, objects) from other tools is skipped, not an error.
 */

export type Frontmatter = Record<string, string | number | boolean>;

/** `---\nkey: "value"\n---\n\n` for the defined, non-empty fields. */
export function writeFrontmatter(data: Record<string, string | number | boolean | null | undefined>): string {
  const lines = Object.entries(data).flatMap(([key, value]) => {
    if (value === null || value === undefined || value === "") return [];
    return [`${key}: ${typeof value === "string" ? JSON.stringify(value) : String(value)}`];
  });
  return lines.length ? `---\n${lines.join("\n")}\n---\n\n` : "";
}

function parseValue(raw: string): string | number | boolean | undefined {
  const value = raw.trim();
  if (!value) return undefined;
  if (value.startsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(value);
      return typeof parsed === "string" ? parsed : undefined;
    } catch {
      return value.replace(/^"|"$/g, "");
    }
  }
  if (value.startsWith("'")) return value.replace(/^'|'$/g, "").replace(/''/g, "'");
  if (value === "true" || value === "false") return value === "true";
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  // Lists/objects in flow style ([a, b], {a: 1}) aren't needed by the import.
  if (/^[[{|>]/.test(value)) return undefined;
  return value.replace(/\s+#.*$/, "");
}

/** Splits a Markdown file into its front-matter fields and the body after it. */
export function parseFrontmatter(source: string): { data: Frontmatter; body: string } {
  const text = source.replace(/^﻿/, "");
  const match = text.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!match) return { data: {}, body: text };
  const data: Frontmatter = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([A-Za-z_][\w-]*):(.*)$/);
    if (!field) continue;
    const value = parseValue(field[2]);
    if (value !== undefined) data[field[1]] = value;
  }
  return { data, body: text.slice(match[0].length) };
}
