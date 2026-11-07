import { Suspense } from "react";
import Link from "next/link";
import { requireUser } from "@/lib/auth/dal";
import { COMMENT_VIEWS, listCommentablePages, listThreadsForAdmin, type CommentView } from "@/lib/comments";
import { getCommentSettings, getSiteSettings } from "@/lib/data/site";
import { isAiReady } from "@/lib/ai/config";
import { CommentsInbox, StaffCommentForm } from "@/components/admin/comments-manager";
import { PageHeader } from "@/components/admin/ui";

export const metadata = { title: "Komentar" };

const LABELS: Record<CommentView, string> = { unanswered: "Perlu dibalas", pending: "Menunggu", approved: "Disetujui", spam: "Spam" };

export default function CommentsPage({ searchParams }: PageProps<"/admin/comments">) {
  return (
    <>
      <PageHeader title="Komentar" description="Percakapan pembaca di halaman dokumentasi. Balas sebagai tim, setujui, sembunyikan, atau tandai spam." />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-fill" />}>
        <Comments searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Comments({ searchParams }: Pick<PageProps<"/admin/comments">, "searchParams">) {
  const user = await requireUser();
  const params = await searchParams;
  // "Perlu dibalas" first: answering is the main job here. Old ?status= links still work.
  const wanted = params.view ?? params.status;
  const view: CommentView = COMMENT_VIEWS.find((v) => v === wanted) ?? "unanswered";
  const [{ threads, counts }, settings, pages, aiReady, site] = await Promise.all([
    listThreadsForAdmin(view),
    getCommentSettings(),
    listCommentablePages(),
    isAiReady(),
    getSiteSettings(),
  ]);

  return (
    <div className="space-y-5">
      {!settings.enabled && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          Komentar sedang dimatikan: bagian komentar tidak tampil di situs dan komentar baru ditolak.
          {user.role === "admin" && (
            <>
              {" "}
              <Link href="/admin/settings#komentar" className="underline">
                Ubah di Pengaturan
              </Link>
              .
            </>
          )}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex gap-1 overflow-x-auto rounded-lg bg-fill p-1" aria-label="Kelompok komentar">
          {COMMENT_VIEWS.map((v) => (
            <Link
              key={v}
              href={`/admin/comments?view=${v}`}
              aria-current={v === view ? "true" : undefined}
              className={`shrink-0 rounded-md px-3 py-1 text-sm whitespace-nowrap transition-colors ${v === view ? "bg-surface font-medium text-fg shadow-sm" : "text-fg-muted hover:text-fg"}`}
            >
              {LABELS[v]}{" "}
              <span className={`text-xs tabular-nums ${(v === "unanswered" || v === "pending") && counts[v] ? "font-medium text-accent" : "text-fg-subtle"}`}>{counts[v]}</span>
            </Link>
          ))}
        </nav>
        <p className="text-xs text-fg-subtle">
          {settings.moderation ? "Moderasi manual: komentar baru menunggu persetujuan." : "Komentar baru langsung tampil (kecuali yang berisi tautan)."}
        </p>
      </div>

      <CommentsInbox threads={threads} view={view} aiEnabled={aiReady} siteName={site.name} />
      <StaffCommentForm pages={pages} />
    </div>
  );
}
