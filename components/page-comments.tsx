"use client";

import { useEffect, useRef, useState } from "react";
import { MessageSquare, Reply } from "lucide-react";

type Comment = { id: string; parentId: string | null; name: string; body: string; staff: boolean; createdAt: string };
/** `viewer` is set when a team member is signed in: they comment under their account name. */
type Loaded = { enabled: boolean; moderation?: boolean; viewer?: { name: string } | null; comments: Comment[] };

const AUTHOR_KEY = "docsku:comment-author";
const relative = new Intl.RelativeTimeFormat("id-ID", { numeric: "auto" });
const absolute = new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeStyle: "short" });

async function fetchComments(slug: string) {
  const response = await fetch(`/api/comments?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
  if (!response.ok) throw new Error(String(response.status));
  return (await response.json()) as Loaded;
}

function savedAuthor() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(AUTHOR_KEY) ?? "null") as { name?: string; email?: string } | null;
    return { name: saved?.name ?? "", email: saved?.email ?? "" };
  } catch {
    return { name: "", email: "" }; // Storage blocked or malformed.
  }
}

function timeAgo(iso: string) {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, size] of steps) if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  return "baru saja";
}

/**
 * Public comments under a published docs page. Loaded after the page, so the
 * prerendered article stays static; the API decides whether comments are on
 * and whether the reader is a signed-in team member.
 * Bodies are shown as plain text (links are not clickable).
 */
export function PageComments({ slug }: { slug: string }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);

  const load = () =>
    fetchComments(slug)
      .then((loaded) => {
        setData(loaded);
        setFailed(false);
      })
      .catch(() => setFailed(true));

  useEffect(() => {
    let live = true;
    fetchComments(slug)
      .then((loaded) => live && setData(loaded))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [slug]);

  if (failed && !data) return null;
  if (!data) return <div className="not-prose mt-10 h-24 animate-pulse rounded-xl bg-fill/60" aria-hidden />;
  if (!data.enabled) return null;

  const top = data.comments.filter((c) => !c.parentId);
  const replies = (id: string) => data.comments.filter((c) => c.parentId === id);

  return (
    <section aria-labelledby="comments-title" data-testid="page-comments" className="not-prose mt-10">
      <h2 id="comments-title" className="flex items-center gap-2 text-base font-semibold text-fg">
        <MessageSquare className="size-4 text-fg-subtle" />
        Komentar{data.comments.length > 0 && <span className="text-sm font-normal text-fg-subtle tabular-nums">({data.comments.length})</span>}
      </h2>

      {top.length === 0 ? (
        <p className="mt-3 text-sm text-fg-subtle">Belum ada komentar. Jadilah yang pertama.</p>
      ) : (
        <ul className="mt-4 space-y-5" data-testid="comment-list">
          {top.map((comment) => (
            <li key={comment.id}>
              <CommentItem comment={comment} />
              <div className="mt-2 ml-11 space-y-4">
                {replies(comment.id).map((reply) => (
                  <CommentItem key={reply.id} comment={reply} />
                ))}
                {replyTo === comment.id ? (
                  <CommentForm
                    slug={slug}
                    parent={comment}
                    moderation={data.moderation === true}
                    viewer={data.viewer ?? null}
                    onCancel={() => setReplyTo(null)}
                    onPosted={(status) => {
                      if (status === "approved") load();
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setReplyTo(comment.id)}
                    className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg"
                    aria-label={`Balas komentar ${comment.name}`}
                  >
                    <Reply className="size-3" />
                    Balas
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6">
        <CommentForm
          slug={slug}
          moderation={data.moderation === true}
          viewer={data.viewer ?? null}
          onPosted={(status) => {
            if (status === "approved") load();
          }}
        />
      </div>
    </section>
  );
}

function CommentItem({ comment }: { comment: Comment }) {
  return (
    <article className="flex gap-3" data-testid="comment">
      <span
        aria-hidden
        className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
          comment.staff ? "bg-accent text-white" : "bg-fill text-fg-muted"
        }`}
      >
        {comment.name.trim().charAt(0).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-medium text-fg">{comment.name}</span>
          {comment.staff && <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent">Tim</span>}
          <time dateTime={comment.createdAt} title={absolute.format(new Date(comment.createdAt))} className="text-xs text-fg-subtle">
            {timeAgo(comment.createdAt)}
          </time>
        </div>
        <p className="mt-1 text-sm whitespace-pre-wrap break-words text-fg-muted">{comment.body}</p>
      </div>
    </article>
  );
}

function CommentForm({
  slug,
  parent,
  moderation,
  viewer,
  onCancel,
  onPosted,
}: {
  slug: string;
  parent?: Comment;
  moderation: boolean;
  viewer: { name: string } | null;
  onCancel?: () => void;
  onPosted: (status: "pending" | "approved") => void;
}) {
  const shownAt = useRef(0);
  // Only rendered in the browser (after the comments load), so storage can be read during render.
  const [author, setAuthor] = useState(savedAuthor);
  const [body, setBody] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const id = parent ? `reply-${parent.id}` : `comment-${slug}`;

  useEffect(() => {
    shownAt.current = Date.now();
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    const response = await fetch("/api/comments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slug,
        parentId: parent?.id ?? null,
        ...(viewer ? {} : { name: author.name, email: author.email }),
        body,
        website,
        elapsed: Date.now() - shownAt.current,
      }),
    }).catch(() => null);
    setBusy(false);
    const result = response ? ((await response.json().catch(() => null)) as { status?: "pending" | "approved"; error?: string } | null) : null;
    if (!response?.ok || !result?.status) {
      const text =
        response?.status === 429
          ? "Terlalu banyak komentar. Coba lagi sebentar lagi."
          : result?.error === "fast"
            ? "Tunggu sebentar, lalu kirim lagi."
            : result?.error === "disabled"
              ? "Komentar sedang ditutup."
              : response?.status === 400
                ? "Periksa lagi: nama minimal 2 huruf, email harus valid jika diisi, dan komentar 2–2.000 karakter."
                : "Komentar belum terkirim. Coba lagi sebentar lagi.";
      return setNotice({ tone: "error", text });
    }
    if (!viewer) {
      try {
        window.localStorage.setItem(AUTHOR_KEY, JSON.stringify(author));
      } catch {
        // Not remembering the name is fine.
      }
    }
    setBody("");
    setNotice({
      tone: "success",
      text: result.status === "pending" ? "Terima kasih! Komentar Anda menunggu persetujuan." : "Komentar terkirim.",
    });
    onPosted(result.status);
  }

  const input =
    "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg outline-none placeholder:text-fg-subtle focus:border-line-strong";
  return (
    <form onSubmit={submit} className="relative space-y-2 rounded-xl border border-line bg-surface/60 p-4" data-testid={parent ? "reply-form" : "comment-form"}>
      <label htmlFor={`${id}-body`} className="block text-sm font-medium text-fg">
        {parent ? `Balas ${parent.name}` : "Tulis komentar"}
      </label>
      <textarea
        id={`${id}-body`}
        name="body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        required
        minLength={2}
        maxLength={2000}
        rows={parent ? 3 : 4}
        placeholder={parent ? "Tulis balasan…" : "Pertanyaan, koreksi, atau tambahan untuk halaman ini…"}
        className={`${input} resize-y`}
      />
      {viewer ? (
        <p className="text-xs text-fg-muted" data-testid="comment-as">
          Berkomentar sebagai <span className="font-medium text-fg">{viewer.name}</span>{" "}
          <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent">Tim</span>
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            name="name"
            aria-label="Nama"
            value={author.name}
            onChange={(e) => setAuthor({ ...author, name: e.target.value })}
            required
            minLength={2}
            maxLength={60}
            placeholder="Nama"
            autoComplete="name"
            className={input}
          />
          <input
            name="email"
            type="email"
            aria-label="Email (opsional)"
            value={author.email}
            onChange={(e) => setAuthor({ ...author, email: e.target.value })}
            maxLength={200}
            placeholder="Email (opsional, tidak ditampilkan)"
            autoComplete="email"
            className={input}
          />
        </div>
      )}
      {/* Honeypot: invisible to people and screen readers, filled in by naive bots. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <p className="text-xs text-fg-subtle">
          {viewer
            ? "Komentar Anda langsung tampil dengan label Tim."
            : moderation
              ? "Komentar tampil setelah disetujui tim dokumentasi."
              : "Komentar langsung tampil. Komentar berisi tautan ditinjau dulu."}
        </p>
        <div className="flex gap-2">
          {onCancel && (
            <button type="button" onClick={onCancel} className="h-8 rounded-lg px-3 text-sm text-fg-muted hover:bg-fill hover:text-fg">
              Batal
            </button>
          )}
          <button type="submit" disabled={busy} className="h-8 rounded-lg bg-fg px-3 text-sm font-medium text-page hover:opacity-85 disabled:opacity-50">
            {parent ? "Kirim balasan" : "Kirim komentar"}
          </button>
        </div>
      </div>
      {notice && (
        <p role={notice.tone === "error" ? "alert" : "status"} className={`text-xs ${notice.tone === "error" ? "text-red-600 dark:text-red-400" : "text-accent"}`}>
          {notice.text}
        </p>
      )}
    </form>
  );
}
