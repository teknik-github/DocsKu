"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, Check, CheckCheck, ExternalLink, Inbox, Loader2, MessageSquarePlus, Send, Sparkles, Trash2 } from "lucide-react";
import { approveComments, deleteComment, moderateComment, postStaffComment, replyToComment } from "@/app/admin/_actions/comments";
import type { CommentThread, CommentView, ThreadMessage } from "@/lib/comments";
import { formatDateTime } from "@/components/admin/format";
import { readNdjson } from "@/components/admin/editor/ai-client";
import { Alert, Button, Field, Panel, Select, Textarea, buttonClass } from "@/components/admin/ui";
import { confirmDialog } from "@/components/admin/dialog";

type Result = { ok: true } | { ok: false; error: string };

const EMPTY: Record<CommentView, string> = {
  unanswered: "Semua komentar sudah dibalas. 🎉",
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

/**
 * Komentar as an inbox: one card per conversation (a comment and its replies),
 * a reply box always ready under it, quick answers and an AI draft.
 */
export function CommentsInbox({ threads, view, aiEnabled, siteName }: { threads: CommentThread[]; view: CommentView; aiEnabled: boolean; siteName: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [page, setPage] = useState("");

  function run(action: () => Promise<Result>, done?: string) {
    setError("");
    setNotice("");
    startTransition(async () => {
      const result = await action();
      if (!result.ok) return setError(result.error);
      if (done) setNotice(done);
      router.refresh();
    });
  }

  const pages = [...new Map(threads.map((t) => [t.pageId, t.pageTitle || "Tanpa judul"])).entries()];
  const shown = page ? threads.filter((t) => t.pageId === page) : threads;
  const waiting = shown.flatMap((t) => t.messages.filter((m) => m.status === "pending").map((m) => m.id));

  return (
    <div className="space-y-4">
      {(pages.length > 1 || (view === "pending" && waiting.length > 1)) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {pages.length > 1 ? (
            <Select value={page} onChange={(e) => setPage(e.target.value)} aria-label="Filter halaman" className="h-8 w-auto max-w-xs text-xs">
              <option value="">Semua halaman ({threads.length} percakapan)</option>
              {pages.map(([id, title]) => (
                <option key={id} value={id}>
                  {title}
                </option>
              ))}
            </Select>
          ) : (
            <span />
          )}
          {view === "pending" && waiting.length > 1 && (
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => approveComments(waiting), `${waiting.length} komentar disetujui.`)}>
              <CheckCheck className="size-3.5" />
              Setujui semua ({waiting.length})
            </Button>
          )}
        </div>
      )}
      {error && <Alert>{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
      {shown.length === 0 ? (
        <Panel className="px-5 py-14 text-center text-sm text-fg-subtle">{EMPTY[view]}</Panel>
      ) : (
        shown.map((thread) => <ThreadCard key={thread.id} thread={thread} view={view} busy={pending} run={run} aiEnabled={aiEnabled} siteName={siteName} />)
      )}
    </div>
  );
}

function ThreadCard({
  thread,
  view,
  busy,
  run,
  aiEnabled,
  siteName,
}: {
  thread: CommentThread;
  view: CommentView;
  busy: boolean;
  run: (action: () => Promise<Result>, done?: string) => void;
  aiEnabled: boolean;
  siteName: string;
}) {
  const [root, ...replies] = thread.messages;
  const lastVisitor = [...thread.messages].reverse().find((m) => !m.staff && m.status !== "spam");
  const canReply = thread.pagePublished && view !== "spam" && root.status !== "spam";
  const hasPending = thread.messages.some((m) => m.status === "pending");

  return (
    <article className="overflow-hidden rounded-xl border border-line bg-surface" data-testid="comment-thread">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-fill/30 px-5 py-2.5 text-xs text-fg-subtle">
        <span className="min-w-0 truncate">
          di{" "}
          <Link href={`/admin/pages/${thread.pageId}`} className="font-medium text-fg-muted hover:text-fg">
            {thread.pageTitle || "Tanpa judul"}
          </Link>
        </span>
        {thread.pagePublished ? (
          <a href={`/docs/${thread.pageSlug}#komentar`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-fg">
            <ExternalLink className="size-3" />
            Lihat di situs
          </a>
        ) : (
          <span>· halaman tidak terbit</span>
        )}
        <span className="ml-auto">
          {thread.messages.length} pesan · {formatDateTime(thread.lastAt)}
        </span>
        {hasPending && <span className="rounded-full bg-amber-100 px-2 py-px font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">Menunggu</span>}
      </header>

      <div className="px-5 py-4">
        <Message message={root} busy={busy} run={run} />
        {replies.length > 0 && (
          <div className="mt-3 ml-4 space-y-3 border-l-2 border-line pl-5">
            {replies.map((m) => (
              <Message key={m.id} message={m} busy={busy} run={run} />
            ))}
          </div>
        )}
      </div>

      {canReply && <Composer thread={thread} target={lastVisitor ?? root} busy={busy} run={run} aiEnabled={aiEnabled} siteName={siteName} />}
    </article>
  );
}

const STATUS_CHIP: Partial<Record<ThreadMessage["status"], { label: string; className: string }>> = {
  pending: { label: "Menunggu", className: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300" },
  spam: { label: "Spam", className: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300" },
};

function Message({ message: m, busy, run }: { message: ThreadMessage; busy: boolean; run: (action: () => Promise<Result>, done?: string) => void }) {
  const chip = STATUS_CHIP[m.status];
  return (
    <div className="group flex gap-3" data-testid="admin-comment">
      <span
        aria-hidden
        className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-medium ${m.staff ? "bg-accent text-white" : "bg-fill text-fg-muted"}`}
      >
        {m.name.trim().charAt(0).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
          <span className="font-medium text-fg">{m.name}</span>
          {m.staff && <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent">Tim</span>}
          {chip && <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${chip.className}`}>{chip.label}</span>}
          {m.email && (
            <a href={`mailto:${m.email}`} className="text-xs text-fg-subtle hover:text-fg">
              {m.email}
            </a>
          )}
          <span className="text-xs text-fg-subtle">{formatDateTime(m.createdAt)}</span>
        </div>
        <p className="mt-1 text-sm whitespace-pre-wrap break-words text-fg-muted">{m.body}</p>
        {/* Moderation, one line under the message; fades in on hover, always reachable by keyboard. */}
        <div className="mt-1.5 flex flex-wrap gap-1 opacity-70 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          {m.status !== "approved" && (
            <ActionButton disabled={busy} onClick={() => run(() => moderateComment(m.id, "approved"), m.status === "spam" ? "Ditandai bukan spam." : "Komentar disetujui.")}>
              <Check className="size-3" />
              {m.status === "spam" ? "Bukan spam" : "Setujui"}
            </ActionButton>
          )}
          {m.status === "approved" && (
            <ActionButton disabled={busy} onClick={() => run(() => moderateComment(m.id, "pending"), "Komentar disembunyikan.")}>
              <Inbox className="size-3" />
              Sembunyikan
            </ActionButton>
          )}
          {m.status !== "spam" && !m.staff && (
            <ActionButton disabled={busy} onClick={() => run(() => moderateComment(m.id, "spam"), "Ditandai spam.")}>
              <Ban className="size-3" />
              Spam
            </ActionButton>
          )}
          <ActionButton
            disabled={busy}
            danger
            label={`Hapus komentar ${m.name}`}
            onClick={async () => {
              const ok = await confirmDialog({
                title: m.parentId ? "Hapus balasan ini?" : "Hapus komentar beserta balasannya?",
                message: "Dihapus permanen. Untuk sekadar menyembunyikannya, pakai Sembunyikan.",
                confirmLabel: "Hapus",
                tone: "danger",
              });
              if (ok) run(() => deleteComment(m.id), "Komentar dihapus.");
            }}
          >
            <Trash2 className="size-3" />
            Hapus
          </ActionButton>
        </div>
      </div>
    </div>
  );
}

function ActionButton({ children, onClick, disabled, danger, label }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] text-fg-subtle hover:bg-fill disabled:opacity-50 ${danger ? "hover:text-red-600" : "hover:text-fg"}`}
    >
      {children}
    </button>
  );
}

/** The reply box under a conversation: Ctrl+Enter sends, quick answers, and an AI draft to edit. */
function Composer({
  thread,
  target,
  busy,
  run,
  aiEnabled,
  siteName,
}: {
  thread: CommentThread;
  target: ThreadMessage;
  busy: boolean;
  run: (action: () => Promise<Result>, done?: string) => void;
  aiEnabled: boolean;
  siteName: string;
}) {
  const [text, setText] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [aiError, setAiError] = useState("");
  const area = useRef<HTMLTextAreaElement>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [text]);

  function send() {
    const body = text.trim();
    if (!body) return;
    run(() => replyToComment({ id: target.id, body }), `Balasan untuk ${target.name} terkirim dan langsung tampil.`);
    setText("");
  }

  async function suggest() {
    setAiError("");
    setDrafting(true);
    setText("");
    const controller = new AbortController();
    abort.current = controller;
    const transcript = thread.messages
      .filter((m) => m.status !== "spam")
      .map((m) => `${m.staff ? `Tim (${m.name})` : `Pembaca (${m.name})`}: ${m.body}`)
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
          instruction: `Tulis balasan untuk komentar pembaca terakhir dalam percakapan di bawah, sebagai tim dokumentasi ${siteName}, di halaman "${thread.pageTitle}". Ramah, singkat (2–4 kalimat), dalam bahasa yang dipakai pembaca. Jawab pertanyaannya bila bisa; jangan mengarang fakta, perintah, atau tautan. Tanpa salam pembuka panjang dan tanpa tanda tangan.`,
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
    <div className="border-t border-line bg-page/50 px-5 py-3">
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
          }}
          rows={2}
          maxLength={2000}
          disabled={drafting}
          aria-label={`Balasan untuk ${target.name}`}
          placeholder={drafting ? "AI sedang menyusun draf…" : `Balas ${target.name} sebagai Tim…`}
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
              className="max-w-[16rem] truncate rounded-full border border-line px-2 py-0.5 text-[11px] text-fg-muted hover:border-accent hover:text-fg disabled:opacity-50"
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
          <span className="ml-auto hidden text-[11px] text-fg-subtle sm:inline">Ctrl+Enter untuk kirim</span>
          <button type="button" onClick={send} disabled={busy || drafting || !text.trim()} className={buttonClass("accent", "sm")}>
            <Send className="size-3.5" />
            Kirim
          </button>
        </div>
      </div>
      {aiError && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{aiError}</p>}
      <p className="mt-1.5 text-[11px] text-fg-subtle">
        Balasan langsung tampil{target.status === "pending" ? `, dan komentar ${target.name} ikut disetujui` : ""}.
      </p>
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
    <Panel className="p-5">
      <h2 className="flex items-center gap-2 text-sm font-medium text-fg">
        <MessageSquarePlus className="size-4 text-accent" />
        Berkomentar sebagai tim
      </h2>
      <p className="mt-1 text-xs text-fg-subtle">Komentar baru (bukan balasan) langsung tampil di halaman dengan nama akun Anda dan label Tim.</p>
      <form
        className="mt-4 space-y-3"
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
    </Panel>
  );
}
