"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, Check, ExternalLink, Inbox, MessageSquarePlus, Reply, Trash2 } from "lucide-react";
import { deleteComment, moderateComment, postStaffComment, replyToComment } from "@/app/admin/_actions/comments";
import type { AdminComment, CommentStatus } from "@/lib/comments";
import { formatDateTime } from "@/components/admin/format";
import { Alert, Button, buttonClass, Field, Panel, Select, Textarea } from "@/components/admin/ui";

const EMPTY: Record<CommentStatus, string> = {
  pending: "Tidak ada komentar yang menunggu.",
  approved: "Belum ada komentar yang disetujui.",
  spam: "Tidak ada spam.",
};

/** Moderation list for one status tab: approve, spam, delete, and reply as the team. */
export function CommentsManager({ items, status }: { items: AdminComment[]; status: CommentStatus }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [replying, setReplying] = useState<string | null>(null);
  const [reply, setReply] = useState("");

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, after?: () => void) {
    setError("");
    startTransition(async () => {
      const result = await action();
      if (!result.ok) return setError(result.error);
      after?.();
      router.refresh();
    });
  }

  if (items.length === 0) return <p className="px-5 py-10 text-center text-sm text-fg-subtle">{EMPTY[status]}</p>;
  return (
    <>
      {error && (
        <div className="px-5 pt-3">
          <Alert>{error}</Alert>
        </div>
      )}
      <ul className="divide-y divide-line" data-testid="comments">
        {items.map((item) => (
          <li key={item.id} className="px-5 py-4" data-testid="admin-comment">
            <div className="flex gap-3">
              <span
                aria-hidden
                className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                  item.staff ? "bg-accent text-white" : "bg-fill text-fg-muted"
                }`}
              >
                {item.name.trim().charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-medium text-fg">{item.name}</span>
                  {item.staff && <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent">Tim</span>}
                  {item.email && <span className="text-xs text-fg-subtle">{item.email}</span>}
                  <span className="text-xs text-fg-subtle">{formatDateTime(item.createdAt)}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-fg-subtle">
                  <span>
                    di{" "}
                    <Link href={`/admin/pages/${item.pageId}`} className="text-fg-muted hover:underline">
                      {item.pageTitle || "Tanpa judul"}
                    </Link>
                  </span>
                  {item.pagePublished && (
                    <a href={`/docs/${item.pageSlug}`} target="_blank" rel="noreferrer" aria-label="Buka di situs" className="hover:text-fg">
                      <ExternalLink className="size-3" />
                    </a>
                  )}
                  {item.parentName && <span>· membalas {item.parentName}</span>}
                  {item.replies > 0 && <span>· {item.replies} balasan</span>}
                  {!item.pagePublished && <span>· halaman tidak terbit</span>}
                </div>
                <p className="mt-2 text-sm whitespace-pre-wrap break-words text-fg-muted">{item.body}</p>

                {replying === item.id && (
                  <form
                    className="mt-3 space-y-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      run(
                        () => replyToComment({ id: item.id, body: reply }),
                        () => {
                          setReplying(null);
                          setReply("");
                        },
                      );
                    }}
                  >
                    <Textarea
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      rows={3}
                      maxLength={2000}
                      required
                      aria-label={`Balasan untuk ${item.name}`}
                      placeholder="Balasan tim (langsung tampil)…"
                    />
                    <div className="flex gap-2">
                      <Button type="submit" size="sm" disabled={pending}>
                        Kirim balasan
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setReplying(null)}>
                        Batal
                      </Button>
                    </div>
                  </form>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap items-start justify-end gap-1">
                {status !== "approved" && (
                  <button type="button" disabled={pending} onClick={() => run(() => moderateComment(item.id, "approved"))} className={buttonClass("ghost", "sm")}>
                    <Check className="size-3.5" />
                    {status === "spam" ? "Bukan spam" : "Setujui"}
                  </button>
                )}
                {status === "approved" && (
                  <button type="button" disabled={pending} onClick={() => run(() => moderateComment(item.id, "pending"))} className={buttonClass("ghost", "sm")}>
                    <Inbox className="size-3.5" />
                    Sembunyikan
                  </button>
                )}
                {status !== "spam" && !item.staff && (
                  <button type="button" disabled={pending} onClick={() => run(() => moderateComment(item.id, "spam"))} className={buttonClass("ghost", "sm")}>
                    <Ban className="size-3.5" />
                    Spam
                  </button>
                )}
                {status !== "spam" && item.pagePublished && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setReplying(replying === item.id ? null : item.id);
                      setReply("");
                    }}
                    className={buttonClass("ghost", "sm")}
                  >
                    <Reply className="size-3.5" />
                    Balas
                  </button>
                )}
                <button
                  type="button"
                  disabled={pending}
                  aria-label={`Hapus komentar ${item.name}`}
                  onClick={() => {
                    if (confirm(item.replies ? "Hapus komentar ini beserta balasannya?" : "Hapus komentar ini?")) run(() => deleteComment(item.id));
                  }}
                  className={`${buttonClass("ghost", "sm")} hover:text-red-600`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
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
      <p className="mt-1 text-xs text-fg-subtle">Komentar langsung tampil di halaman dengan nama akun Anda dan label Tim.</p>
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
