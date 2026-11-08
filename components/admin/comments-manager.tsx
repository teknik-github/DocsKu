"use client";

import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CornerDownRight, Loader2, MessageSquare, MessageSquarePlus, Send, Sparkles, X } from "lucide-react";
import { deleteComment, deleteComments, moderateComment, moderateComments, postStaffComment, replyToComment } from "@/app/admin/_actions/comments";
import type { CommentRow, CommentView } from "@/lib/comments";
import { formatDateTime } from "@/components/admin/format";
import { readNdjson } from "@/components/admin/editor/ai-client";
import { Alert, Button, Field, Panel, Select, Textarea, buttonClass } from "@/components/admin/ui";
import { confirmDialog } from "@/components/admin/dialog";

type Result = { ok: true } | { ok: false; error: string };
type Run = (action: () => Promise<Result>, done?: string) => void;

const EMPTY: Record<CommentView, string> = {
  all: "Belum ada komentar.",
  unanswered: "Semua komentar sudah dibalas.",
  pending: "Tidak ada komentar yang menunggu persetujuan.",
  approved: "Belum ada komentar yang disetujui.",
  spam: "Tidak ada spam.",
};

/** Quick answers; clicking one adds it to the reply box. */
const TEMPLATES = [
  "Terima kasih atas masukannya!",
  "Terima kasih, sudah kami perbarui di halaman ini.",
  "Bisa ceritakan langkah yang Anda lakukan dan pesan error yang muncul?",
  "Pertanyaan bagus. Kami akan menambahkan penjelasannya di dokumentasi.",
];

const BULK = [
  { value: "approved", label: "Setujui" },
  { value: "pending", label: "Sembunyikan (kembali menunggu)" },
  { value: "spam", label: "Tandai spam" },
  { value: "delete", label: "Hapus permanen" },
] as const;

const COLS = "md:grid-cols-[2rem_13rem_minmax(0,1fr)_12rem_8.5rem] xl:grid-cols-[2rem_16rem_minmax(0,1fr)_16rem_10rem]";

/**
 * Komentar as a WordPress-style list: one compact row per comment, actions on
 * hover, bulk actions, and a reply box that opens under the row.
 */
export function CommentsTable({ rows, view, aiEnabled, siteName }: { rows: CommentRow[]; view: CommentView; aiEnabled: boolean; siteName: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState("");
  const [replying, setReplying] = useState<string | null>(null);

  const run: Run = (action, done) => {
    setError("");
    setNotice("");
    startTransition(async () => {
      const result = await action();
      if (!result.ok) return setError(result.error);
      if (done) setNotice(done);
      setSelected(new Set());
      router.refresh();
    });
  };

  async function applyBulk() {
    const ids = [...selected];
    if (!bulk || ids.length === 0) return;
    if (bulk === "delete") {
      const ok = await confirmDialog({
        title: `Hapus ${ids.length} komentar?`,
        message: "Komentar dan balasan-balasannya dihapus permanen.",
        confirmLabel: "Hapus",
        tone: "danger",
      });
      if (ok) run(() => deleteComments(ids), `${ids.length} komentar dihapus.`);
      return;
    }
    const label = BULK.find((b) => b.value === bulk)?.label.toLowerCase();
    run(() => moderateComments(ids, bulk as "approved" | "pending" | "spam"), `${ids.length} komentar: ${label}.`);
  }

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={bulk} onChange={(e) => setBulk(e.target.value)} aria-label="Tindakan massal" className="h-8 w-56! text-xs">
          <option value="">Tindakan massal</option>
          {BULK.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </Select>
        <Button size="sm" variant="secondary" onClick={applyBulk} disabled={!bulk || selected.size === 0 || pending}>
          Terapkan{selected.size ? ` (${selected.size})` : ""}
        </Button>
      </div>
      {error && <Alert>{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <Panel className="overflow-hidden">
        <div className={`hidden gap-3 border-b border-line bg-fill/40 px-4 py-2 text-xs font-medium text-fg-muted md:grid ${COLS}`}>
          <input
            type="checkbox"
            aria-label="Pilih semua"
            checked={allSelected}
            onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
            className="size-4 self-center accent-accent"
          />
          <span>Penulis</span>
          <span>Komentar</span>
          <span>Untuk halaman</span>
          <span>Dikirim</span>
        </div>

        {rows.length === 0 ? (
          <p className="px-5 py-14 text-center text-sm text-fg-subtle">{EMPTY[view]}</p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((row) => (
              <Fragment key={row.id}>
                <Row
                  row={row}
                  selected={selected.has(row.id)}
                  onToggle={() => toggle(row.id)}
                  replying={replying === row.id}
                  onReply={() => setReplying(replying === row.id ? null : row.id)}
                  busy={pending}
                  run={run}
                />
                {replying === row.id && (
                  <li className={`gap-x-3 bg-fill/30 px-4 py-3 md:grid ${COLS}`}>
                    {/* Same columns as the rows, so the box lines up under the comment text. */}
                    <div className="md:col-[3/6] xl:col-[3/5]">
                      <Composer row={row} busy={pending} run={run} aiEnabled={aiEnabled} siteName={siteName} onClose={() => setReplying(null)} />
                    </div>
                  </li>
                )}
              </Fragment>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function Row({
  row,
  selected,
  onToggle,
  replying,
  onReply,
  busy,
  run,
}: {
  row: CommentRow;
  selected: boolean;
  onToggle: () => void;
  replying: boolean;
  onReply: () => void;
  busy: boolean;
  run: Run;
}) {
  const waiting = row.status === "pending";
  const actions: { label: string; onClick: () => void; danger?: boolean; href?: string }[] = [];
  if (row.status !== "approved") actions.push({ label: row.status === "spam" ? "Bukan spam" : "Setujui", onClick: () => run(() => moderateComment(row.id, "approved"), "Komentar disetujui.") });
  if (row.status === "approved") actions.push({ label: "Sembunyikan", onClick: () => run(() => moderateComment(row.id, "pending"), "Komentar disembunyikan.") });
  if (row.status !== "spam" && row.pagePublished) actions.push({ label: replying ? "Tutup balasan" : "Balas", onClick: onReply });
  if (row.status !== "spam" && !row.staff) actions.push({ label: "Spam", onClick: () => run(() => moderateComment(row.id, "spam"), "Ditandai spam.") });
  actions.push({
    label: "Hapus",
    danger: true,
    onClick: async () => {
      const ok = await confirmDialog({
        title: row.parentId ? "Hapus balasan ini?" : "Hapus komentar beserta balasannya?",
        message: "Dihapus permanen. Untuk sekadar menyembunyikannya, pakai Sembunyikan.",
        confirmLabel: "Hapus",
        tone: "danger",
      });
      if (ok) run(() => deleteComment(row.id), "Komentar dihapus.");
    },
  });

  return (
    <li
      data-testid="admin-comment"
      className={`group relative grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3 gap-y-1 px-4 py-3 ${COLS} ${
        waiting ? "bg-amber-50/70 dark:bg-amber-950/15" : selected ? "bg-accent-soft/30" : "hover:bg-fill/30"
      }`}
    >
      {/* Pending comments get a coloured edge, like WordPress. */}
      {waiting && <span className="absolute inset-y-0 left-0 w-1 bg-amber-400" aria-hidden />}
      <input type="checkbox" checked={selected} onChange={onToggle} aria-label={`Pilih komentar ${row.name}`} className="mt-2 size-4 self-start justify-self-start accent-accent" />

      <div className="flex min-w-0 items-start gap-2.5">
        <span className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-medium ${row.staff ? "bg-accent text-white" : "bg-fill text-fg-muted"}`} aria-hidden>
          {row.name.trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-medium text-fg">
            <span className="truncate">{row.name}</span>
            {row.staff && <span className="shrink-0 rounded bg-accent-soft px-1 py-px text-[10px] font-medium text-accent">Tim</span>}
          </p>
          {row.email && (
            <a href={`mailto:${row.email}`} className="block truncate text-xs text-fg-subtle hover:text-fg">
              {row.email}
            </a>
          )}
          {/* Small screens: page and date under the author. */}
          <p className="mt-0.5 truncate text-xs text-fg-subtle md:hidden">
            {row.pageTitle || "Tanpa judul"} · {formatDateTime(row.createdAt)}
          </p>
        </div>
      </div>

      <div className="col-start-2 min-w-0 md:col-start-auto">
        <div className="flex flex-wrap items-center gap-x-2 text-xs text-fg-subtle">
          {waiting && <span className="font-medium text-amber-700 dark:text-amber-400">Menunggu persetujuan</span>}
          {row.status === "spam" && <span className="font-medium text-red-600 dark:text-red-400">Spam</span>}
          {row.parentName && (
            <span className="inline-flex items-center gap-1" title={row.parentBody ?? undefined}>
              <CornerDownRight className="size-3" />
              Membalas <span className="text-fg-muted">{row.parentName}</span>
            </span>
          )}
        </div>
        <p className="mt-0.5 line-clamp-4 text-sm whitespace-pre-wrap break-words text-fg">{row.body}</p>
        {/* Row actions: shown on hover or focus on wide screens, always on small ones. */}
        <div className="mt-1 flex flex-wrap items-center text-xs md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:focus-within:opacity-100">
          {actions.map((action, i) => (
            <Fragment key={action.label}>
              {i > 0 && <span className="px-1.5 text-line-strong">|</span>}
              <button
                type="button"
                disabled={busy}
                onClick={action.onClick}
                className={`font-medium disabled:opacity-50 ${action.danger ? "text-red-600 hover:underline dark:text-red-400" : "text-accent hover:underline"}`}
              >
                {action.label}
              </button>
            </Fragment>
          ))}
          {row.pagePublished && (
            <>
              <span className="px-1.5 text-line-strong">|</span>
              <a href={`/docs/${row.pageSlug}#komentar`} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">
                Lihat
              </a>
            </>
          )}
        </div>
      </div>

      <div className="hidden min-w-0 text-sm md:block">
        <Link href={`/admin/pages/${row.pageId}`} className="line-clamp-2 text-fg hover:text-accent">
          {row.pageTitle || "Tanpa judul"}
        </Link>
        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-fill px-1.5 py-px text-[11px] text-fg-muted" title={`${row.pageComments} komentar disetujui di halaman ini`}>
          <MessageSquare className="size-3" />
          {row.pageComments}
        </span>
        {!row.pagePublished && <span className="ml-1.5 text-[11px] text-fg-subtle">tidak terbit</span>}
      </div>

      <p className="hidden text-xs text-fg-muted md:block">{formatDateTime(row.createdAt)}</p>
    </li>
  );
}

/** The reply box under a row: Ctrl+Enter sends, quick answers, and an AI draft to edit. */
function Composer({ row, busy, run, aiEnabled, siteName, onClose }: { row: CommentRow; busy: boolean; run: Run; aiEnabled: boolean; siteName: string; onClose: () => void }) {
  const [text, setText] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [aiError, setAiError] = useState("");
  const area = useRef<HTMLTextAreaElement>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    area.current?.focus();
    return () => abort.current?.abort();
  }, []);
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [text]);

  function send() {
    const body = text.trim();
    if (!body) return;
    run(() => replyToComment({ id: row.id, body }), `Balasan untuk ${row.name} terkirim dan langsung tampil.`);
    onClose();
  }

  async function suggest() {
    setAiError("");
    setDrafting(true);
    setText("");
    const controller = new AbortController();
    abort.current = controller;
    const transcript = [row.parentName && row.parentBody ? `${row.parentName}: ${row.parentBody}` : "", `${row.staff ? "Tim" : "Pembaca"} (${row.name}): ${row.body}`]
      .filter(Boolean)
      .join("\n\n");
    try {
      const res = await fetch("/admin/api/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          action: "custom",
          inline: true,
          fresh: true,
          instruction: `Tulis balasan untuk komentar pembaca terakhir di bawah, sebagai tim dokumentasi ${siteName}, di halaman "${row.pageTitle}". Ramah, singkat (2–4 kalimat), dalam bahasa yang dipakai pembaca. Jawab pertanyaannya bila bisa; jangan mengarang fakta, perintah, atau tautan. Tanpa salam pembuka panjang dan tanpa tanda tangan.`,
          selection: transcript,
        }),
      });
      await readNdjson<{ t: string; v?: string }>(res, (event) => {
        if (event.t === "text" && event.v) setText((current) => current + event.v);
        if (event.t === "error" && event.v) setAiError(event.v);
      });
      area.current?.focus();
    } catch (error) {
      if (!controller.signal.aborted) setAiError((error as Error).message);
    } finally {
      setDrafting(false);
    }
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs text-fg-muted">
        <span>
          Membalas <span className="font-medium text-fg">{row.name}</span> sebagai Tim
        </span>
        <button type="button" onClick={onClose} aria-label="Tutup balasan" className="text-fg-subtle hover:text-fg">
          <X className="size-4" />
        </button>
      </div>
      <div className="rounded-lg border border-line bg-surface focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
        <textarea
          ref={area}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              send();
            }
            if (e.key === "Escape") onClose();
          }}
          rows={2}
          maxLength={2000}
          disabled={drafting}
          aria-label={`Balasan untuk ${row.name}`}
          placeholder={drafting ? "AI sedang menyusun draf…" : "Tulis balasan…"}
          className="block w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-sm text-fg outline-none placeholder:text-fg-subtle"
        />
        <div className="flex flex-wrap items-center gap-1.5 px-2 pb-2">
          {TEMPLATES.map((template) => (
            <button
              key={template}
              type="button"
              disabled={drafting}
              onClick={() => {
                setText((current) => (current.trim() ? `${current.trimEnd()} ${template}` : template));
                area.current?.focus();
              }}
              className="max-w-[15rem] truncate rounded-full border border-line px-2 py-0.5 text-[11px] text-fg-muted hover:border-accent hover:text-fg disabled:opacity-50"
              title={template}
            >
              {template}
            </button>
          ))}
          {aiEnabled && (
            <button
              type="button"
              onClick={drafting ? () => abort.current?.abort() : suggest}
              className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent hover:bg-accent-soft/70"
            >
              {drafting ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
              {drafting ? "Berhenti" : "Saran AI"}
            </button>
          )}
          <span className="ml-auto hidden text-[11px] text-fg-subtle sm:inline">Ctrl+Enter kirim · Esc tutup</span>
          <button type="button" onClick={send} disabled={busy || drafting || !text.trim()} className={buttonClass("accent", "sm")}>
            <Send className="size-3.5" />
            Kirim
          </button>
        </div>
      </div>
      {aiError && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{aiError}</p>}
      {row.status === "pending" && <p className="mt-1.5 text-[11px] text-fg-subtle">Membalas juga menyetujui komentar ini.</p>}
    </div>
  );
}

/** A new comment on a published page, as the team: shown at once with the "Tim" badge. */
export function StaffCommentForm({ pages }: { pages: { id: string; title: string; slug: string }[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pageId, setPageId] = useState("");
  const [body, setBody] = useState("");
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  if (pages.length === 0) return null;
  return (
    <details className="group rounded-xl border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3 text-sm font-medium text-fg [&::-webkit-details-marker]:hidden">
        <MessageSquarePlus className="size-4 text-accent" />
        Komentar baru sebagai tim
        <span className="ml-auto text-xs font-normal text-fg-subtle group-open:hidden">Buka</span>
      </summary>
      <form
        className="space-y-3 border-t border-line px-5 py-4"
        data-testid="staff-comment-form"
        onSubmit={(event) => {
          event.preventDefault();
          setMessage(null);
          startTransition(async () => {
            const result = await postStaffComment({ pageId, body });
            if (!result.ok) return setMessage({ tone: "error", text: result.error });
            setBody("");
            setMessage({ tone: "success", text: "Komentar terkirim." });
            router.refresh();
          });
        }}
      >
        <p className="text-xs text-fg-subtle">Komentar baru (bukan balasan) langsung tampil di halaman dengan nama akun Anda dan label Tim.</p>
        <Field label="Halaman">
          <Select value={pageId} onChange={(e) => setPageId(e.target.value)} required>
            <option value="" disabled>
              Pilih halaman…
            </option>
            {pages.map((page) => (
              <option key={page.id} value={page.id}>
                {page.title || "Tanpa judul"} — /docs/{page.slug}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Komentar">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={2000} required placeholder="Pengumuman, klarifikasi, atau jawaban untuk pembaca…" />
        </Field>
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        <Button type="submit" size="sm" disabled={pending}>
          Kirim komentar
        </Button>
      </form>
    </details>
  );
}
