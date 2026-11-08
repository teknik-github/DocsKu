"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Activity, Columns2, GitCompare, History, Loader2, Rows3, RotateCcw, X } from "lucide-react";
import { compareRevision, type CompareAgainst, type CompareResult } from "@/app/admin/_actions/revisions";
import { confirmDialog } from "@/components/admin/dialog";
import { formatDateTime } from "@/components/admin/format";
import { Avatar } from "@/components/avatar";
import { Select, buttonClass } from "@/components/admin/ui";
import type { DiffBlock, Segment } from "@/lib/revision-diff";

export type RevisionItem = {
  id: string;
  title: string;
  reason: string;
  createdAt: string;
  author: string | null;
  avatar?: string | null;
};

/** What produced each revision (`page_revisions.reason`). */
export const REVISION_REASONS: Record<string, string> = {
  save: "Disimpan",
  publish: "Diterbitkan",
  schedule: "Dijadwalkan",
  restore: "Dipulihkan",
  "before-restore": "Sebelum dipulihkan",
  import: "Diimpor",
  ai: "Dibuat dengan AI",
  "ai-edit": "Sebelum perubahan AI",
  mcp: "Lewat MCP",
  translate: "Diterjemahkan AI",
  "before-translate": "Sebelum diterjemahkan",
};

const CONTEXT = 3;

export function RevisionHistory({
  pageId,
  revisions,
  status,
  isAdmin,
  onRestore,
}: {
  pageId: string;
  revisions: RevisionItem[];
  status: "draft" | "scheduled" | "published";
  isAdmin: boolean;
  onRestore: (revisionId: string) => Promise<void>;
}) {
  const [comparing, setComparing] = useState<string | null>(null);

  async function restore(id: string) {
    const ok = await confirmDialog({
      title: "Pulihkan revisi ini?",
      message: "Isi draf diganti dengan revisi ini. Draf sekarang disimpan dulu di riwayat sebagai “Sebelum dipulihkan”, jadi bisa dikembalikan.",
      confirmLabel: "Pulihkan",
    });
    if (!ok) return false;
    await onRestore(id);
    return true;
  }

  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
        <History className="size-4" />
        Riwayat revisi
      </h3>
      <p className="mb-3 text-xs text-fg-subtle">
        Revisi dibuat saat Anda menekan Ctrl+S, menerbitkan, atau memulihkan. Bandingkan untuk melihat apa yang berubah; memulihkan hanya mengubah draf.
      </p>
      {revisions.length === 0 ? (
        <p className="text-sm text-fg-subtle">Belum ada revisi.</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {revisions.map((revision, i) => (
            <li key={revision.id} className="flex items-center gap-2 px-3 py-2">
              <Avatar name={revision.author ?? "?"} src={revision.avatar} size={22} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">
                  {REVISION_REASONS[revision.reason] ?? revision.reason}
                  {i === 0 && <span className="ml-1.5 text-xs text-fg-subtle">(terbaru)</span>}
                </span>
                <span className="block truncate text-xs text-fg-subtle">
                  {formatDateTime(revision.createdAt)}
                  {revision.author && ` · ${revision.author}`}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setComparing(revision.id)}
                title="Bandingkan"
                aria-label={`Bandingkan revisi ${formatDateTime(revision.createdAt)}`}
                className="inline-flex size-7 items-center justify-center rounded-md text-fg-muted hover:bg-fill hover:text-fg"
              >
                <GitCompare className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => void restore(revision.id)}
                className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-fg-muted hover:bg-fill hover:text-fg"
              >
                <RotateCcw className="size-3" />
                Pulihkan
              </button>
            </li>
          ))}
        </ul>
      )}
      {isAdmin && (
        <Link href={`/admin/activity?halaman=${pageId}`} className="mt-2 inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg">
          <Activity className="size-3.5" />
          Riwayat aktivitas halaman ini
        </Link>
      )}
      {comparing && (
        <CompareDialog
          pageId={pageId}
          revisions={revisions}
          initial={comparing}
          published={status !== "draft"}
          onClose={() => setComparing(null)}
          onRestore={async (id) => {
            if (await restore(id)) setComparing(null);
          }}
        />
      )}
    </section>
  );
}

function CompareDialog({
  pageId,
  revisions,
  initial,
  published,
  onClose,
  onRestore,
}: {
  pageId: string;
  revisions: RevisionItem[];
  initial: string;
  published: boolean;
  onClose: () => void;
  onRestore: (id: string) => Promise<void>;
}) {
  const [revisionId, setRevisionId] = useState(initial);
  const [against, setAgainst] = useState<CompareAgainst>("draft");
  const [view, setView] = useState<"inline" | "split">("inline");
  const [result, setResult] = useState<CompareResult | null>(null);
  const [loading, setLoading] = useState(true);
  const panel = useRef<HTMLDivElement>(null);
  const index = revisions.findIndex((r) => r.id === revisionId);
  const oldest = index === revisions.length - 1;

  useEffect(() => {
    let live = true;
    // Show the spinner over the previous result instead of clearing it.
    const timer = window.setTimeout(() => live && setLoading(true), 0);
    compareRevision(pageId, revisionId, against)
      .then((next) => live && setResult(next))
      .catch(() => live && setResult({ ok: false, error: "Tidak bisa terhubung ke server." }))
      .finally(() => {
        window.clearTimeout(timer);
        if (live) setLoading(false);
      });
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [pageId, revisionId, against]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector('[role="alertdialog"]')) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [onClose]);

  // Portal to <body>: the settings panel is its own stacking context, under the editor's sticky header.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="compare-title"
        className="flex w-full max-w-6xl flex-col overflow-hidden border-line bg-surface shadow-xl outline-none sm:rounded-2xl sm:border"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-3 sm:px-5">
          <h2 id="compare-title" className="mr-auto text-base font-semibold text-fg">
            Bandingkan revisi
          </h2>
          <div className="hidden items-center rounded-lg bg-fill p-0.5 lg:flex" role="group" aria-label="Tampilan">
            {(
              [
                ["inline", "Satu kolom", Rows3],
                ["split", "Berdampingan", Columns2],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                aria-pressed={view === value}
                onClick={() => setView(value)}
                className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs ${view === value ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg"}`}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            ))}
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup" className="inline-flex size-8 items-center justify-center rounded-md text-fg-muted hover:bg-fill hover:text-fg">
            <X className="size-4" />
          </button>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 border-b border-line px-4 py-3 text-sm sm:grid-cols-2 sm:px-5">
          <label className="min-w-0">
            <span className="mb-1 block text-xs text-fg-subtle">Revisi</span>
            <Select value={revisionId} onChange={(e) => setRevisionId(e.target.value)} className="w-full">
              {revisions.map((r, i) => (
                <option key={r.id} value={r.id}>
                  {formatDateTime(r.createdAt)} · {REVISION_REASONS[r.reason] ?? r.reason}
                  {r.author ? ` · ${r.author}` : ""}
                  {i === 0 ? " (terbaru)" : ""}
                </option>
              ))}
            </Select>
          </label>
          <label className="min-w-0">
            <span className="mb-1 block text-xs text-fg-subtle">Dibandingkan dengan</span>
            <Select value={against} onChange={(e) => setAgainst(e.target.value as CompareAgainst)} className="w-full">
              <option value="draft">Draf saat ini</option>
              <option value="live" disabled={!published}>
                Versi terbit{published ? "" : " (belum terbit)"}
              </option>
              <option value="previous" disabled={oldest}>
                Revisi sebelumnya{oldest ? " (tidak ada)" : ""}
              </option>
            </Select>
          </label>
        </div>

        <div className="relative min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5" aria-busy={loading}>
          {loading && (
            <div className="absolute inset-x-0 top-3 z-10 flex justify-center">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs text-fg-muted shadow-sm">
                <Loader2 className="size-3.5 animate-spin" />
                Membandingkan…
              </span>
            </div>
          )}
          {result && !result.ok && <p className="text-sm text-red-600 dark:text-red-400">{result.error}</p>}
          {result?.ok && <CompareBody result={result} view={view} />}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-5">
          <p className="text-xs text-fg-subtle">Memulihkan mengganti draf dengan revisi yang dipilih. Situs berubah setelah Anda menerbitkan.</p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={buttonClass("ghost")}>
              Tutup
            </button>
            <button type="button" onClick={() => void onRestore(revisionId)} className={buttonClass("primary")}>
              <RotateCcw className="size-4" />
              Pulihkan revisi ini
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function CompareBody({ result, view }: { result: Extract<CompareResult, { ok: true }>; view: "inline" | "split" }) {
  const identical = !result.tooLarge && result.added === 0 && result.removed === 0 && result.fields.length === 0;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="inline-flex items-center gap-1.5 text-fg-muted">
          <span className="size-2.5 rounded-sm bg-red-500/70" />
          {result.left.label}
          {result.left.at && <span className="text-fg-subtle">({formatDateTime(result.left.at)})</span>}
        </span>
        <span className="inline-flex items-center gap-1.5 text-fg-muted">
          <span className="size-2.5 rounded-sm bg-emerald-500/70" />
          {result.right.label}
          {result.right.at && <span className="text-fg-subtle">({formatDateTime(result.right.at)})</span>}
        </span>
        {!result.tooLarge && (
          <span className="ml-auto font-mono tabular-nums">
            <span className="text-emerald-700 dark:text-emerald-400">+{result.added}</span> <span className="text-red-700 dark:text-red-400">−{result.removed}</span> baris
          </span>
        )}
      </div>

      {identical && <p className="rounded-lg bg-fill px-3 py-6 text-center text-sm text-fg-muted">Tidak ada perbedaan.</p>}

      {result.fields.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-line">
          <p className="border-b border-line bg-fill/50 px-3 py-1.5 text-xs font-medium text-fg-muted">Detail halaman</p>
          <dl className="divide-y divide-line text-sm">
            {result.fields.map((field) => (
              <div key={field.label} className="grid gap-1 px-3 py-2 sm:grid-cols-[11rem_minmax(0,1fr)]">
                <dt className="text-xs text-fg-subtle">{field.label}</dt>
                <dd className="min-w-0 space-y-1 break-words">
                  <p className="text-red-800 dark:text-red-300">
                    <span className="mr-1.5 font-mono text-xs select-none">−</span>
                    <Segments segments={field.before} empty="(kosong)" />
                  </p>
                  <p className="text-emerald-800 dark:text-emerald-300">
                    <span className="mr-1.5 font-mono text-xs select-none">+</span>
                    <Segments segments={field.after} empty="(kosong)" />
                  </p>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {result.tooLarge ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          Isi halaman terlalu panjang untuk dibandingkan baris per baris.
        </p>
      ) : (
        result.blocks.some((b) => b.kind === "change") && (
          <div className="overflow-x-auto rounded-lg border border-line">
            <p className="sticky left-0 border-b border-line bg-fill/50 px-3 py-1.5 text-xs font-medium text-fg-muted">Isi (Markdown)</p>
            {view === "split" ? <SplitDiff blocks={result.blocks} /> : <InlineDiff blocks={result.blocks} />}
          </div>
        )
      )}
    </div>
  );
}

function Segments({ segments, empty }: { segments: Segment[]; empty?: string }) {
  if (!segments.some((s) => s.text)) return <span className="text-fg-subtle italic">{empty}</span>;
  return (
    <>
      {segments.map((s, i) =>
        s.kind === "same" ? (
          <Fragment key={i}>{s.text}</Fragment>
        ) : (
          <mark key={i} className={`rounded-sm text-inherit ${s.kind === "add" ? "bg-emerald-300/60 dark:bg-emerald-500/40" : "bg-red-300/60 line-through decoration-red-700/50 dark:bg-red-500/40"}`}>
            {s.text}
          </mark>
        ),
      )}
    </>
  );
}

/** Unchanged stretches longer than the context around changes fold into a "show N lines" button. */
function useFolding(blocks: DiffBlock[]) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const expand = (i: number) => setOpen((prev) => new Set(prev).add(i));
  const parts = (i: number, length: number) => {
    const first = i === 0;
    const last = i === blocks.length - 1;
    const head = first ? 0 : CONTEXT;
    const tail = last ? 0 : CONTEXT;
    if (open.has(i) || length <= head + tail + 1) return { head: length, hidden: 0, tail: 0 };
    return { head, hidden: length - head - tail, tail };
  };
  return { parts, expand };
}

const lineNo = "w-10 shrink-0 px-2 text-right font-mono text-[11px] text-fg-subtle select-none tabular-nums";
const code = "min-w-0 flex-1 px-2 font-mono text-xs leading-5 whitespace-pre-wrap break-words";

function FoldButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="block w-full bg-fill/60 py-1 text-center text-xs text-accent hover:bg-fill">
      Tampilkan {count} baris yang sama
    </button>
  );
}

function InlineDiff({ blocks }: { blocks: DiffBlock[] }) {
  const { parts, expand } = useFolding(blocks);
  return (
    <div className="min-w-[28rem]">
      {blocks.map((block, i) => {
        if (block.kind === "change") {
          return (
            <Fragment key={i}>
              {block.removed.map((row) => (
                <div key={`d${row.line}`} className="flex bg-red-50 dark:bg-red-950/30">
                  <span className={lineNo}>{row.line}</span>
                  <span className={lineNo} />
                  <span className="w-4 shrink-0 font-mono text-xs leading-5 text-red-700 select-none dark:text-red-400">−</span>
                  <span className={`${code} text-red-900 dark:text-red-200`}>
                    <Segments segments={row.segments} />
                  </span>
                </div>
              ))}
              {block.added.map((row) => (
                <div key={`a${row.line}`} className="flex bg-emerald-50 dark:bg-emerald-950/30">
                  <span className={lineNo} />
                  <span className={lineNo}>{row.line}</span>
                  <span className="w-4 shrink-0 font-mono text-xs leading-5 text-emerald-700 select-none dark:text-emerald-400">+</span>
                  <span className={`${code} text-emerald-900 dark:text-emerald-200`}>
                    <Segments segments={row.segments} />
                  </span>
                </div>
              ))}
            </Fragment>
          );
        }
        const { head, hidden, tail } = parts(i, block.rows.length);
        const row = (r: (typeof block.rows)[number]) => (
          <div key={`s${r.left}`} className="flex">
            <span className={lineNo}>{r.left}</span>
            <span className={lineNo}>{r.right}</span>
            <span className="w-4 shrink-0" />
            <span className={`${code} text-fg-muted`}>{r.text || " "}</span>
          </div>
        );
        return (
          <Fragment key={i}>
            {block.rows.slice(0, head).map(row)}
            {hidden > 0 && <FoldButton count={hidden} onClick={() => expand(i)} />}
            {tail > 0 && block.rows.slice(block.rows.length - tail).map(row)}
          </Fragment>
        );
      })}
    </div>
  );
}

function SplitDiff({ blocks }: { blocks: DiffBlock[] }) {
  const { parts, expand } = useFolding(blocks);
  const cell = (line: number | null, content: React.ReactNode, tone: "del" | "add" | "same" | "empty") => (
    <div
      className={`flex min-w-0 ${
        tone === "del" ? "bg-red-50 text-red-900 dark:bg-red-950/30 dark:text-red-200" : tone === "add" ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200" : tone === "empty" ? "bg-fill/40" : "text-fg-muted"
      }`}
    >
      <span className={lineNo}>{line ?? ""}</span>
      <span className={code}>{content}</span>
    </div>
  );
  return (
    <div className="grid grid-cols-2 divide-x divide-line">
      {blocks.map((block, i) => {
        if (block.kind === "change") {
          const rows = Math.max(block.removed.length, block.added.length);
          return (
            <Fragment key={i}>
              {Array.from({ length: rows }, (_, r) => {
                const del = block.removed[r];
                const add = block.added[r];
                return (
                  <Fragment key={r}>
                    {del ? cell(del.line, <Segments segments={del.segments} />, "del") : cell(null, " ", "empty")}
                    {add ? cell(add.line, <Segments segments={add.segments} />, "add") : cell(null, " ", "empty")}
                  </Fragment>
                );
              })}
            </Fragment>
          );
        }
        const { head, hidden, tail } = parts(i, block.rows.length);
        const row = (r: (typeof block.rows)[number]) => (
          <Fragment key={`s${r.left}`}>
            {cell(r.left, r.text || " ", "same")}
            {cell(r.right, r.text || " ", "same")}
          </Fragment>
        );
        return (
          <Fragment key={i}>
            {block.rows.slice(0, head).map(row)}
            {hidden > 0 && (
              <div className="col-span-2">
                <FoldButton count={hidden} onClick={() => expand(i)} />
              </div>
            )}
            {tail > 0 && block.rows.slice(block.rows.length - tail).map(row)}
          </Fragment>
        );
      })}
    </div>
  );
}
