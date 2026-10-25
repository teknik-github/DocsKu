import { Suspense } from "react";
import Link from "next/link";
import { requireUser } from "@/lib/auth/dal";
import { COMMENT_STATUSES, listCommentablePages, listCommentsForAdmin, type CommentStatus } from "@/lib/comments";
import { getCommentSettings } from "@/lib/data/site";
import { CommentsManager, StaffCommentForm } from "@/components/admin/comments-manager";
import { PageHeader, Panel } from "@/components/admin/ui";

export const metadata = { title: "Komentar" };

const LABELS: Record<CommentStatus, string> = { pending: "Menunggu", approved: "Disetujui", spam: "Spam" };

export default function CommentsPage({ searchParams }: PageProps<"/admin/comments">) {
  return (
    <>
      <PageHeader title="Komentar" description="Komentar pembaca di halaman dokumentasi. Berkomentar dan membalas sebagai tim, sembunyikan, tandai spam, atau hapus." />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-fill" />}>
        <Comments searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Comments({ searchParams }: Pick<PageProps<"/admin/comments">, "searchParams">) {
  const user = await requireUser();
  const params = await searchParams;
  const status: CommentStatus = COMMENT_STATUSES.find((s) => s === params.status) ?? "pending";
  const [{ items, counts }, settings, pages] = await Promise.all([listCommentsForAdmin(status), getCommentSettings(), listCommentablePages()]);

  return (
    <div className="space-y-4">
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
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          <div className="flex gap-1 rounded-lg bg-fill p-1" role="tablist" aria-label="Status komentar">
            {COMMENT_STATUSES.map((s) => (
              <Link
                key={s}
                href={`/admin/comments?status=${s}`}
                role="tab"
                aria-selected={s === status}
                className={`rounded-md px-3 py-1 text-sm transition-colors ${s === status ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg"}`}
              >
                {LABELS[s]} <span className="text-xs text-fg-subtle tabular-nums">{counts[s]}</span>
              </Link>
            ))}
          </div>
          <p className="text-xs text-fg-subtle">
            {settings.moderation ? "Moderasi manual: komentar baru menunggu persetujuan." : "Komentar baru langsung tampil (kecuali yang berisi tautan)."}
          </p>
        </div>
        <CommentsManager items={items} status={status} />
      </Panel>
      <StaffCommentForm pages={pages} />
    </div>
  );
}
