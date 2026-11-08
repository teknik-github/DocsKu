import { diffLines, diffWordsWithSpace } from "diff";

/**
 * Text comparison for "Bandingkan" in the editor's revision history: a line
 * diff of the pages' Markdown (lib/content/markdown.ts) with word-level
 * highlights inside changed lines, and word diffs for short fields. Runs on
 * the server (compareRevision), so the client never ships the diff library.
 */

export type Segment = { text: string; kind: "same" | "add" | "del" };
export type SameRow = { left: number; right: number; text: string };
export type ChangeRow = { line: number; segments: Segment[] };
export type DiffBlock = { kind: "same"; rows: SameRow[] } | { kind: "change"; removed: ChangeRow[]; added: ChangeRow[] };

export type FieldDiff = { label: string; before: Segment[]; after: Segment[] };

export type TextDiff = { blocks: DiffBlock[]; added: number; removed: number; tooLarge: boolean };

/** Give up rather than hold the server for long on huge pages. */
const TIMEOUT_MS = 2500;
const MAX_CHARS = 600_000;

const linesOf = (value: string) => {
  const lines = value.split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
};

/** Word diff of two strings, split into what each side shows. */
export function wordSegments(before: string, after: string): { before: Segment[]; after: Segment[] } {
  const parts = diffWordsWithSpace(before, after);
  return {
    before: parts.filter((p) => !p.added).map((p) => ({ text: p.value, kind: p.removed ? "del" : "same" })),
    after: parts.filter((p) => !p.removed).map((p) => ({ text: p.value, kind: p.added ? "add" : "same" })),
  };
}

/** Pairs a removed line with an added one only when they share enough text to be "the same line, edited". */
function similar(a: string, b: string) {
  if (!a.trim() || !b.trim()) return false;
  const parts = diffWordsWithSpace(a, b);
  const common = parts.filter((p) => !p.added && !p.removed).reduce((n, p) => n + p.value.trim().length, 0);
  return common / Math.max(a.trim().length, b.trim().length) >= 0.35;
}

export function diffText(before: string, after: string): TextDiff {
  if (before.length + after.length > MAX_CHARS) return { blocks: [], added: 0, removed: 0, tooLarge: true };
  const parts = diffLines(before, after, { timeout: TIMEOUT_MS });
  if (!parts) return { blocks: [], added: 0, removed: 0, tooLarge: true };

  const blocks: DiffBlock[] = [];
  let left = 1;
  let right = 1;
  let added = 0;
  let removed = 0;
  const pending: { removed: string[]; added: string[]; leftStart: number; rightStart: number } = { removed: [], added: [], leftStart: 0, rightStart: 0 };

  const flush = () => {
    if (!pending.removed.length && !pending.added.length) return;
    const change: Extract<DiffBlock, { kind: "change" }> = { kind: "change", removed: [], added: [] };
    const pairs = Math.min(pending.removed.length, pending.added.length);
    pending.removed.forEach((text, i) => {
      const other = i < pairs ? pending.added[i] : null;
      change.removed.push({
        line: pending.leftStart + i,
        segments: other !== null && similar(text, other) ? wordSegments(text, other).before : [{ text, kind: "del" }],
      });
    });
    pending.added.forEach((text, i) => {
      const other = i < pairs ? pending.removed[i] : null;
      change.added.push({
        line: pending.rightStart + i,
        segments: other !== null && similar(other, text) ? wordSegments(other, text).after : [{ text, kind: "add" }],
      });
    });
    blocks.push(change);
    pending.removed = [];
    pending.added = [];
  };

  for (const part of parts) {
    const lines = linesOf(part.value);
    if (part.removed) {
      if (!pending.removed.length && !pending.added.length) {
        pending.leftStart = left;
        pending.rightStart = right;
      }
      pending.removed.push(...lines);
      removed += lines.length;
      left += lines.length;
    } else if (part.added) {
      if (!pending.removed.length && !pending.added.length) {
        pending.leftStart = left;
        pending.rightStart = right;
      }
      pending.added.push(...lines);
      added += lines.length;
      right += lines.length;
    } else {
      flush();
      blocks.push({ kind: "same", rows: lines.map((text, i) => ({ left: left + i, right: right + i, text })) });
      left += lines.length;
      right += lines.length;
    }
  }
  flush();
  return { blocks, added, removed, tooLarge: false };
}

export function diffField(label: string, before: string, after: string): FieldDiff | null {
  if (before === after) return null;
  return { label, ...wordSegments(before, after) };
}
