"use client";

import { useState } from "react";
import { diffLines } from "diff";
import { ChevronDown } from "lucide-react";

/**
 * What an AI edit changes, before it is applied: the page split into its ##
 * sections, each compared with the proposal (changed, added, removed or the
 * same), with a line diff per section. For a full replacement, every changed
 * section can be left out; `onChange` gets the Markdown to apply (the current
 * text for sections that were left out) and whether everything is included.
 */

type Section = { key: string; heading: string; text: string };
type Row = { key: string; heading: string; status: "same" | "changed" | "added" | "removed"; base?: string; proposed?: string };

/** Splits Markdown at "## " headings outside code fences; the part before the first heading is the intro. */
export function splitSections(markdown: string): Section[] {
  const sections: Section[] = [];
  let current: Section = { key: "", heading: "", text: "" };
  let fence: string | null = null;
  const seen = new Map<string, number>();
  for (const line of markdown.replace(/\r\n/g, "\n").split("\n")) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/)?.[1];
    if (marker) fence = fence ? (marker.startsWith(fence[0]) && marker.length >= fence.length ? null : fence) : marker;
    if (!fence && /^##\s+\S/.test(line)) {
      if (current.text.trim() || current.heading) sections.push(current);
      const heading = line.replace(/^##\s+/, "").trim();
      const norm = heading.toLocaleLowerCase("id");
      const n = (seen.get(norm) ?? 0) + 1;
      seen.set(norm, n);
      current = { key: `${norm}#${n}`, heading, text: `${line}\n` };
    } else {
      current.text += `${line}\n`;
    }
  }
  if (current.text.trim() || current.heading) sections.push(current);
  return sections.map((section) => ({ ...section, text: section.text.replace(/\n+$/, "\n") }));
}

function compare(base: string, proposed: string): Row[] {
  const before = splitSections(base);
  const after = splitSections(proposed);
  const baseIndex = new Map(before.map((section, i) => [section.key, i]));
  const used = new Set<number>();
  const rows: Row[] = [];
  let last = -1;
  const removedUpTo = (limit: number) => {
    for (let i = last + 1; i < limit; i++) {
      if (used.has(i)) continue;
      used.add(i);
      rows.push({ key: `-${before[i].key}`, heading: before[i].heading, status: "removed", base: before[i].text });
    }
  };
  for (const section of after) {
    const match = baseIndex.get(section.key);
    if (match !== undefined && !used.has(match)) {
      removedUpTo(match);
      used.add(match);
      last = Math.max(last, match);
      const same = before[match].text.trim() === section.text.trim();
      rows.push({ key: section.key, heading: section.heading, status: same ? "same" : "changed", base: before[match].text, proposed: section.text });
    } else {
      rows.push({ key: `+${section.key}`, heading: section.heading, status: "added", proposed: section.text });
    }
  }
  removedUpTo(before.length);
  return rows;
}

function merge(rows: Row[], skipped: Set<string>) {
  return rows
    .map((row) => {
      const keep = !skipped.has(row.key);
      if (row.status === "same") return row.proposed ?? "";
      if (row.status === "changed") return keep ? row.proposed : row.base;
      if (row.status === "added") return keep ? row.proposed : "";
      return keep ? "" : row.base;
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

const LABEL: Record<Row["status"], string> = { same: "Tidak berubah", changed: "Diubah", added: "Bagian baru", removed: "Dihapus" };
const TONE: Record<Row["status"], string> = {
  same: "bg-fill text-fg-subtle",
  changed: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  added: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  removed: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
};

function LineDiff({ before, after }: { before: string; after: string }) {
  const parts = diffLines(before, after);
  return (
    <pre className="overflow-x-auto font-mono text-[11px] leading-relaxed">
      {parts.map((part, i) =>
        part.value
          .replace(/\n$/, "")
          .split("\n")
          .map((line, j) => (
            <div
              key={`${i}:${j}`}
              className={
                part.added
                  ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
                  : part.removed
                    ? "bg-red-50 text-red-900 line-through decoration-red-400/60 dark:bg-red-950/40 dark:text-red-200"
                    : "text-fg-subtle"
              }
            >
              <span aria-hidden className="inline-block w-4 select-none">
                {part.added ? "+" : part.removed ? "−" : " "}
              </span>
              {line || " "}
            </div>
          )),
      )}
    </pre>
  );
}

export function ProposalDiff({
  base,
  proposed,
  mode,
  selectable,
  onChange,
}: {
  base: string;
  proposed: string;
  mode: "replace" | "append";
  /** Sections can be left out (full replacement, not yet applied). */
  selectable: boolean;
  onChange?: (markdown: string, all: boolean) => void;
}) {
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Set<string>>(new Set());

  if (mode === "append") {
    return (
      <div className="max-h-96 overflow-auto rounded-lg border border-line bg-page p-2" data-testid="proposal-diff">
        <p className="mb-1 text-[11px] text-fg-muted">Ditambahkan di akhir halaman:</p>
        <LineDiff before="" after={proposed} />
      </div>
    );
  }
  if (base.length + proposed.length > 120_000) {
    return <p className="text-xs text-fg-subtle">Halaman terlalu panjang untuk dibandingkan di sini. Lihat tab Pratinjau.</p>;
  }

  const rows = compare(base, proposed);
  const changes = rows.filter((row) => row.status !== "same");
  const toggle = (key: string) => {
    const next = new Set(skipped);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSkipped(next);
    onChange?.(merge(rows, next), next.size === 0);
  };

  return (
    <div className="max-h-[28rem] space-y-1.5 overflow-auto rounded-lg border border-line bg-page p-2" data-testid="proposal-diff">
      <p className="px-1 text-[11px] text-fg-muted">
        {changes.length === 0
          ? "Isi tidak berubah."
          : `${changes.length} bagian berubah${selectable ? " · hapus centang untuk mempertahankan versi sekarang" : ""}.`}
      </p>
      {rows.map((row) => {
        const expanded = row.status !== "same" ? !open.has(row.key) : open.has(row.key);
        return (
          <div key={row.key} className={`rounded-md border ${skipped.has(row.key) ? "border-dashed border-line opacity-60" : "border-line"}`} data-diff-section={row.status}>
            <div className="flex items-center gap-2 px-2 py-1.5">
              {selectable && row.status !== "same" && (
                <input
                  type="checkbox"
                  checked={!skipped.has(row.key)}
                  onChange={() => toggle(row.key)}
                  aria-label={`Terapkan perubahan bagian ${row.heading || "pembuka"}`}
                  className="size-3.5 accent-(--accent)"
                />
              )}
              <button
                type="button"
                onClick={() => {
                  const next = new Set(open);
                  if (next.has(row.key)) next.delete(row.key);
                  else next.add(row.key);
                  setOpen(next);
                }}
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs"
              >
                <ChevronDown className={`size-3 shrink-0 text-fg-subtle transition-transform ${expanded ? "" : "-rotate-90"}`} />
                <span className="truncate font-medium text-fg">{row.heading || "Pembuka"}</span>
                <span className={`ml-auto shrink-0 rounded px-1.5 py-px text-[10px] font-medium ${TONE[row.status]}`}>{LABEL[row.status]}</span>
              </button>
            </div>
            {expanded && (
              <div className="border-t border-line px-2 py-1.5">
                <LineDiff before={row.base ?? ""} after={row.proposed ?? ""} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
