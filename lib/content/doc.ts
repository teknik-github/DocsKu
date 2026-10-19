import type { JSONContent } from "@tiptap/core";
import GithubSlugger from "github-slugger";

/**
 * Document helpers shared by the public renderer, the dashboard, and the seed
 * script. Content is a TipTap/ProseMirror JSON tree; see lib/content/schema.ts
 * for the custom node types.
 */

export type Heading = { id: string; text: string; level: 2 | 3 };

export const EMPTY_DOC: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };

export function textOf(node: JSONContent | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map(textOf).join("");
}

/** Visits every node depth-first, in document order. */
export function walk(node: JSONContent, visit: (node: JSONContent) => void) {
  visit(node);
  for (const child of node.content ?? []) walk(child, visit);
}

/**
 * Heading ids in document order, generated like GitHub (and rehype-slug).
 * The renderer consumes them in the same order, so ids always line up with
 * the table of contents.
 */
export function headingIds(doc: JSONContent): string[] {
  const slugger = new GithubSlugger();
  const ids: string[] = [];
  walk(doc, (node) => {
    if (node.type === "heading") ids.push(slugger.slug(textOf(node)) || "bagian");
  });
  return ids;
}

/** `##` and `###` headings for the "Di halaman ini" table of contents. */
export function tocHeadings(doc: JSONContent): Heading[] {
  const ids = headingIds(doc);
  const headings: Heading[] = [];
  let index = 0;
  walk(doc, (node) => {
    if (node.type !== "heading") return;
    const id = ids[index++];
    const level = node.attrs?.level ?? 2;
    if (level <= 3) headings.push({ id, text: textOf(node), level: level <= 2 ? 2 : 3 });
  });
  return headings;
}

/** Parses a line spec like "2,4-6" into line numbers. */
export function parseLineSpec(spec: string | null | undefined): number[] {
  if (!spec) return [];
  const lines: number[] = [];
  for (const part of spec.split(",")) {
    const [start, end] = part.trim().split("-").map(Number);
    if (!Number.isInteger(start)) continue;
    const last = Number.isInteger(end) ? Math.min(end, start + 500) : start;
    for (let line = start; line <= last; line++) lines.push(line);
  }
  return lines;
}

/** Only links that can't run script: http(s), mailto, site-relative, anchors. */
export function safeHref(href: unknown): string | undefined {
  if (typeof href !== "string") return undefined;
  const value = href.trim();
  if (/^(https?:\/\/|mailto:)/i.test(value)) return value;
  if (/^[/#]/.test(value) && !value.startsWith("//")) return value;
  return undefined;
}

export const isExternalHref = (href: string) => /^https?:\/\//i.test(href);
