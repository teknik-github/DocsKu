"use client";

import { useEffect, useState, useTransition } from "react";
import type { Editor } from "@tiptap/core";
import { AlertCircle, AlertTriangle, Check, ChevronDown, Info, Loader2, MessageSquarePlus, RotateCcw, Trash2, X } from "lucide-react";
import { addNote, deleteNote, listNotes, resolveNote, type NoteView } from "@/app/admin/_actions/notes";
import { checkQuality, type QualityIssue, type QualityReport } from "@/components/admin/editor/quality";
import { findQuote } from "@/components/admin/editor/note-highlights";
import { Avatar } from "@/components/avatar";
import { confirmDialog } from "@/components/admin/dialog";
import { Button, Textarea } from "@/components/admin/ui";
import type { PageSeo } from "@/lib/site-types";

/**
 * "Periksa" beside the editor: writing checks for the working copy (Kualitas)
 * and the team's internal notes on the page (Catatan). Notes are loaded by
 * `usePageNotes` in the page editor, so their highlights show even while this
 * panel is closed.
 */

export type ReviewTab = "quality" | "notes";

const when = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

/** Notes of one page, reloaded after every change, and their highlights in the editor. */
export function usePageNotes(pageId: string, editor: Editor | null, activeId: string | null) {
  const [notes, setNotes] = useState<NoteView[] | null>(null);
  const [error, setError] = useState("");

  async function reload() {
    const result = await listNotes(pageId);
    if (result.ok) {
      setNotes(result.notes);
      setError("");
    } else setError(result.error);
  }

  useEffect(() => {
    let live = true;
    void listNotes(pageId).then((result) => {
      if (!live) return;
      if (result.ok) setNotes(result.notes);
      else setError(result.error);
    });
    return () => {
      live = false;
    };
  }, [pageId]);

  // Open top-level notes with a quote are highlighted in the text.
  useEffect(() => {
    if (!editor || editor.isDestroyed || !notes) return;
    const quotes = notes
      .filter((note) => !note.parentId && !note.resolvedAt && note.quote)
      .map((note) => ({ id: note.id, quote: note.quote, body: note.body, active: note.id === activeId }));
    editor.commands.setNoteHighlights(quotes);
  }, [editor, notes, activeId]);

  const open = notes?.filter((note) => !note.parentId && !note.resolvedAt).length ?? 0;
  return { notes, error, reload, open };
}

/** Recomputed when the document changes (once per frame) or the title/description change. */
function useQuality(editor: Editor, input: { title: string; description: string; seo: PageSeo; isHome: boolean; avoid: string[] }): QualityReport {
  const compute = () => checkQuality({ ...input, seoTitle: input.seo.title, seoDescription: input.seo.description, doc: editor.state.doc });
  const [report, setReport] = useState<QualityReport>(compute);
  const { title, description, seo, isHome, avoid } = input;
  useEffect(() => {
    let frame = 0;
    const run = () => {
      frame = 0;
      setReport(checkQuality({ title, description, seoTitle: seo.title, seoDescription: seo.description, isHome, avoid, doc: editor.state.doc }));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(run);
    };
    schedule();
    editor.on("update", schedule);
    return () => {
      editor.off("update", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [editor, title, description, seo, isHome, avoid]);
  return report;
}

/** Scrolls the editor to a position and puts the cursor there. */
function jumpTo(editor: Editor, pos: number, to?: number) {
  const safe = Math.min(Math.max(pos, 0), editor.state.doc.content.size);
  editor
    .chain()
    .focus()
    .setTextSelection(to !== undefined ? { from: safe, to: Math.min(to, editor.state.doc.content.size) } : safe + 1)
    .scrollIntoView()
    .run();
  const dom = editor.view.domAtPos(Math.min(safe + 1, editor.state.doc.content.size)).node as HTMLElement | null;
  (dom?.nodeType === 1 ? dom : dom?.parentElement)?.scrollIntoView({ block: "center", behavior: "smooth" });
}

const LEVEL_ICON = {
  error: <AlertCircle className="size-4 shrink-0 text-red-600 dark:text-red-400" />,
  warn: <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />,
  info: <Info className="size-4 shrink-0 text-sky-600 dark:text-sky-400" />,
};

export function ReviewPanel({
  editor,
  tab,
  onTab,
  title,
  description,
  seo,
  isHome,
  avoid = [],
  pageId,
  viewer,
  canModerate,
  notes,
  draftQuote,
  onDraftQuoteDone,
  activeNote,
  onActiveNote,
  onClose,
}: {
  editor: Editor;
  tab: ReviewTab;
  onTab: (tab: ReviewTab) => void;
  title: string;
  description: string;
  seo: PageSeo;
  isHome: boolean;
  /** Words the team avoids (Pengaturan → Gaya penulisan). */
  avoid?: string[];
  pageId: string;
  viewer?: { id: string; name: string };
  /** Editors and admins may delete anyone's note. */
  canModerate: boolean;
  notes: ReturnType<typeof usePageNotes>;
  /** Text selected with "Catatan internal" in the bubble menu, waiting for its note. */
  draftQuote: string | null;
  onDraftQuoteDone: () => void;
  activeNote: string | null;
  onActiveNote: (id: string | null) => void;
  onClose: () => void;
}) {
  const report = useQuality(editor, { title, description, seo, isHome, avoid });
  const counted = report.issues.filter((issue) => issue.level !== "info").length;
  return (
    <aside className="fixed top-14 right-0 bottom-0 z-30 flex w-full max-w-sm flex-col border-l border-line bg-page shadow-xl" data-testid="review-panel">
      <div className="flex items-center gap-1 border-b border-line px-3 py-2">
        <div role="tablist" className="flex flex-1 gap-1">
          {(
            [
              ["quality", "Kualitas", counted],
              ["notes", "Catatan", notes.open],
            ] as const
          ).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => onTab(id)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${tab === id ? "bg-fill font-medium text-fg" : "text-fg-muted hover:text-fg"}`}
            >
              {label}
              {count > 0 && <span className="rounded-full bg-accent px-1.5 text-[10px] font-semibold text-white tabular-nums">{count}</span>}
            </button>
          ))}
        </div>
        <button type="button" onClick={onClose} aria-label="Tutup panel" className="inline-flex size-8 items-center justify-center rounded-lg text-fg-muted hover:bg-fill">
          <X className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "quality" ? (
          <QualityTab editor={editor} report={report} />
        ) : (
          <NotesTab
            editor={editor}
            pageId={pageId}
            viewer={viewer}
            canModerate={canModerate}
            notes={notes}
            draftQuote={draftQuote}
            onDraftQuoteDone={onDraftQuoteDone}
            activeNote={activeNote}
            onActiveNote={onActiveNote}
          />
        )}
      </div>
    </aside>
  );
}

function QualityTab({ editor, report }: { editor: Editor; report: QualityReport }) {
  const { readability: r, issues } = report;
  return (
    <div className="space-y-4 p-4" data-testid="quality-tab">
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          ["Kata", r.words.toLocaleString("id-ID")],
          ["Menit baca", String(r.minutes)],
          ["Keterbacaan", r.label],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-line bg-surface px-2 py-2.5">
            <div className="text-base font-semibold text-fg tabular-nums">{value}</div>
            <div className="text-[11px] text-fg-subtle">{label}</div>
          </div>
        ))}
      </div>
      {r.sentences > 0 && (
        <p className="text-xs text-fg-subtle">
          {r.sentences} kalimat, rata-rata {r.avgSentence.toLocaleString("id-ID")} kata per kalimat{r.longSentences ? `, ${r.longSentences} kalimat panjang` : ""}.
        </p>
      )}
      {issues.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
          <Check className="size-4 shrink-0" />
          Tidak ada catatan. Halaman siap diterbitkan.
        </div>
      ) : (
        <ul className="space-y-2">
          {issues.map((issue) => (
            <IssueRow key={issue.id} editor={editor} issue={issue} />
          ))}
        </ul>
      )}
    </div>
  );
}

function IssueRow({ editor, issue }: { editor: Editor; issue: QualityIssue }) {
  const content = (
    <>
      {LEVEL_ICON[issue.level]}
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-fg">{issue.message}</span>
        {issue.hint && <span className="mt-0.5 block text-xs text-fg-subtle">{issue.hint}</span>}
      </span>
    </>
  );
  return (
    <li data-quality-issue={issue.level}>
      {issue.pos !== undefined ? (
        <button type="button" onClick={() => jumpTo(editor, issue.pos!)} className="flex w-full items-start gap-2.5 rounded-lg border border-line bg-surface px-3 py-2.5 text-left hover:border-line-strong">
          {content}
        </button>
      ) : (
        <div className="flex items-start gap-2.5 rounded-lg border border-line bg-surface px-3 py-2.5">{content}</div>
      )}
    </li>
  );
}

function NotesTab({
  editor,
  pageId,
  viewer,
  canModerate,
  notes,
  draftQuote,
  onDraftQuoteDone,
  activeNote,
  onActiveNote,
}: {
  editor: Editor;
  pageId: string;
  viewer?: { id: string; name: string };
  canModerate: boolean;
  notes: ReturnType<typeof usePageNotes>;
  draftQuote: string | null;
  onDraftQuoteDone: () => void;
  activeNote: string | null;
  onActiveNote: (id: string | null) => void;
}) {
  const [body, setBody] = useState("");
  const [composing, setComposing] = useState(false);
  const [error, setError] = useState("");
  const [showResolved, setShowResolved] = useState(false);
  const [pending, start] = useTransition();
  const writing = composing || draftQuote !== null;

  useEffect(() => {
    if (!activeNote) return;
    document.querySelector(`[data-note-card="${activeNote}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeNote]);

  function submit() {
    setError("");
    start(async () => {
      const result = await addNote(pageId, { body, quote: draftQuote ?? "" });
      if (!result.ok) return setError(result.error);
      setBody("");
      setComposing(false);
      onDraftQuoteDone();
      await notes.reload();
      onActiveNote(result.id);
    });
  }

  if (!notes.notes) {
    return (
      <div className="flex items-center justify-center gap-2 p-10 text-sm text-fg-subtle">
        {notes.error || (
          <>
            <Loader2 className="size-4 animate-spin" /> Memuat catatan…
          </>
        )}
      </div>
    );
  }
  const top = notes.notes.filter((note) => !note.parentId);
  const replies = (id: string) => notes.notes!.filter((note) => note.parentId === id);
  const open = top.filter((note) => !note.resolvedAt);
  const resolved = top.filter((note) => note.resolvedAt);

  return (
    <div className="space-y-3 p-4" data-testid="notes-tab">
      <p className="text-xs text-fg-subtle">Catatan hanya terlihat oleh tim di editor, tidak pernah tampil di situs. Pilih teks lalu klik ikon catatan untuk mengomentari bagian tertentu.</p>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {writing ? (
        <div className="space-y-2 rounded-lg border border-accent/40 bg-surface p-3" data-testid="note-composer">
          {draftQuote && <blockquote className="border-l-2 border-amber-400 pl-2 text-xs text-fg-muted italic">“{draftQuote}”</blockquote>}
          <Textarea
            autoFocus
            value={body}
            maxLength={2000}
            rows={3}
            placeholder="Misalnya: cek lagi angka ini sebelum terbit."
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && body.trim()) submit();
              if (e.key === "Escape") {
                setComposing(false);
                onDraftQuoteDone();
              }
            }}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setComposing(false);
                setBody("");
                onDraftQuoteDone();
              }}
            >
              Batal
            </Button>
            <Button variant="accent" size="sm" onClick={submit} disabled={pending || !body.trim()}>
              Simpan catatan
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" size="sm" onClick={() => setComposing(true)} className="w-full">
          <MessageSquarePlus className="size-4" />
          Catatan baru
        </Button>
      )}

      {open.length === 0 && !writing && <p className="py-6 text-center text-sm text-fg-subtle">Belum ada catatan terbuka.</p>}
      {open.map((note) => (
        <NoteCard
          key={note.id}
          note={note}
          replies={replies(note.id)}
          editor={editor}
          pageId={pageId}
          viewer={viewer}
          canModerate={canModerate}
          active={note.id === activeNote}
          onActive={onActiveNote}
          reload={notes.reload}
        />
      ))}

      {resolved.length > 0 && (
        <div className="border-t border-line pt-3">
          <button type="button" onClick={() => setShowResolved(!showResolved)} className="flex w-full items-center gap-1 text-xs text-fg-muted hover:text-fg">
            <ChevronDown className={`size-3.5 transition-transform ${showResolved ? "" : "-rotate-90"}`} />
            Selesai ({resolved.length})
          </button>
          {showResolved && (
            <div className="mt-3 space-y-3 opacity-80">
              {resolved.map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  replies={replies(note.id)}
                  editor={editor}
                  pageId={pageId}
                  viewer={viewer}
                  canModerate={canModerate}
                  active={false}
                  onActive={onActiveNote}
                  reload={notes.reload}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NoteCard({
  note,
  replies,
  editor,
  pageId,
  viewer,
  canModerate,
  active,
  onActive,
  reload,
}: {
  note: NoteView;
  replies: NoteView[];
  editor: Editor;
  pageId: string;
  viewer?: { id: string; name: string };
  canModerate: boolean;
  active: boolean;
  onActive: (id: string | null) => void;
  reload: () => Promise<void>;
}) {
  const [reply, setReply] = useState("");
  const [replying, setReplying] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const range = note.quote ? findQuote(editor.state.doc, note.quote) : null;

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError("");
    start(async () => {
      const result = await action();
      if (!result.ok) return setError(result.error ?? "Gagal.");
      await reload();
    });
  }

  async function remove(target: NoteView) {
    const ok = await confirmDialog({
      title: target.parentId ? "Hapus balasan?" : "Hapus catatan?",
      message: target.parentId ? "Balasan ini dihapus permanen." : "Catatan beserta semua balasannya dihapus permanen.",
      confirmLabel: "Hapus",
      tone: "danger",
    });
    if (ok) run(() => deleteNote(target.id));
  }

  const mayDelete = (target: NoteView) => canModerate || target.authorId === viewer?.id;

  return (
    <div
      data-note-card={note.id}
      onClick={() => onActive(note.id)}
      className={`rounded-lg border bg-surface p-3 transition-colors ${active ? "border-amber-400 ring-2 ring-amber-400/30" : "border-line"}`}
    >
      {note.quote && (
        <button
          type="button"
          disabled={!range}
          onClick={(e) => {
            e.stopPropagation();
            onActive(note.id);
            if (range) jumpTo(editor, range.from, range.to);
          }}
          title={range ? "Tampilkan di teks" : "Teks ini sudah tidak ada di halaman"}
          className="mb-2 block w-full border-l-2 border-amber-400 pl-2 text-left text-xs text-fg-muted italic hover:text-fg disabled:line-through disabled:opacity-60"
        >
          “{note.quote}”
        </button>
      )}
      {[note, ...replies].map((item) => (
        <div key={item.id} className={item.parentId ? "mt-2 border-t border-line pt-2" : ""}>
          <div className="flex items-center gap-2">
            <Avatar name={item.authorName} src={item.authorAvatar} size={20} />
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-fg">
              {item.authorName}
              {item.source === "reader" && (
                <span className="ml-1.5 rounded bg-sky-100 px-1 py-px text-[10px] font-medium text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">dari situs</span>
              )}
            </span>
            <time className="shrink-0 text-[11px] text-fg-subtle" dateTime={item.createdAt}>
              {when.format(new Date(item.createdAt))}
            </time>
            {mayDelete(item) && (
              <button
                type="button"
                aria-label="Hapus"
                onClick={(e) => {
                  e.stopPropagation();
                  void remove(item);
                }}
                className="inline-flex size-6 items-center justify-center rounded text-fg-subtle hover:bg-fill hover:text-red-600"
              >
                <Trash2 className="size-3" />
              </button>
            )}
          </div>
          <p className="mt-1 text-sm whitespace-pre-line text-fg">{item.body}</p>
        </div>
      ))}
      {note.resolvedAt && (
        <p className="mt-2 text-[11px] text-emerald-700 dark:text-emerald-400">
          Selesai{note.resolvedBy ? ` oleh ${note.resolvedBy}` : ""} · {when.format(new Date(note.resolvedAt))}
        </p>
      )}
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
      {replying ? (
        <div className="mt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
          <Textarea
            autoFocus
            rows={2}
            value={reply}
            maxLength={2000}
            placeholder="Balas…"
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && reply.trim())
                run(async () => {
                  const result = await addNote(pageId, { body: reply, parentId: note.id });
                  if (result.ok) {
                    setReply("");
                    setReplying(false);
                  }
                  return result;
                });
              if (e.key === "Escape") setReplying(false);
            }}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setReplying(false)}>
              Batal
            </Button>
            <Button
              variant="accent"
              size="sm"
              disabled={pending || !reply.trim()}
              onClick={() =>
                run(async () => {
                  const result = await addNote(pageId, { body: reply, parentId: note.id });
                  if (result.ok) {
                    setReply("");
                    setReplying(false);
                  }
                  return result;
                })
              }
            >
              Balas
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" onClick={() => setReplying(true)} disabled={pending}>
            Balas
          </Button>
          {note.resolvedAt ? (
            <Button variant="ghost" size="sm" onClick={() => run(() => resolveNote(note.id, false))} disabled={pending}>
              <RotateCcw className="size-3.5" />
              Buka lagi
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => run(() => resolveNote(note.id, true))} disabled={pending}>
              <Check className="size-3.5" />
              Selesai
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
