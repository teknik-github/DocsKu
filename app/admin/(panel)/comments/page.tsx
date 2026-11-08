import { Fragment, Suspense } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { COMMENTS_PER_PAGE, COMMENT_VIEWS, listCommentRows, listCommentablePages, type CommentView } from "@/lib/comments";
import { getCommentSettings, getSiteSettings } from "@/lib/data/site";
import { isAiReady } from "@/lib/ai/config";
import { CommentsTable, StaffCommentForm } from "@/components/admin/comments-manager";
import { PageHeader, buttonClass, inputClass } from "@/components/admin/ui";

export const metadata = { title: "Komentar" };

const LABELS: Record<CommentView, string> = { all: "Semua", unanswered: "Perlu dibalas", pending: "Menunggu", approved: "Disetujui", spam: "Spam" };
const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

export default function CommentsPage({ searchParams }: PageProps<"/admin/comments">) {
  return (
    <>
      <PageHeader title="Komentar" description="Komentar pembaca di halaman dokumentasi. Arahkan kursor ke komentar untuk menyetujui, membalas, atau menandai spam." />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-fill" />}>
        <Comments searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Comments({ searchParams }: Pick<PageProps<"/admin/comments">, "searchParams">) {
  const user = await requireUser();
  const params = await searchParams;
  // Old ?status= links still work.
  const wanted = params.view ?? params.status;
  const view: CommentView = COMMENT_VIEWS.find((v) => v === wanted) ?? "all";
  const pageId = isId(params.halaman) ? params.halaman : undefined;
  const query = typeof params.q === "string" ? params.q.slice(0, 100) : "";
  const page = Math.max(1, Math.floor(Number(params.p) || 1));

  const [{ rows, total, counts, pages: commented }, settings, publishedPages, aiReady, site] = await Promise.all([
    listCommentRows({ view, pageId, query, page }),
    getCommentSettings(),
    listCommentablePages(),
    isAiReady(),
    getSiteSettings(),
  ]);
  const lastPage = Math.max(1, Math.ceil(total / COMMENTS_PER_PAGE));

  /** The list's URL with some parameters changed. Switching status drops the filters; paging keeps them. */
  const href = (next: { view?: CommentView; p?: number }) => {
    const qs = new URLSearchParams();
    const v = next.view ?? view;
    const keep = v === view;
    if (v !== "all") qs.set("view", v);
    if (pageId && keep) qs.set("halaman", pageId);
    if (query && keep) qs.set("q", query);
    if (next.p && next.p > 1) qs.set("p", String(next.p));
    const s = qs.toString();
    return `/admin/comments${s ? `?${s}` : ""}`;
  };

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

      {/* Status links, WordPress-style: Semua (12) | Perlu dibalas (4) | … */}
      <nav aria-label="Status komentar" className="flex flex-wrap items-center text-sm">
        {COMMENT_VIEWS.map((v, i) => (
          <Fragment key={v}>
            {i > 0 && <span className="px-2 text-line-strong">|</span>}
            <Link
              href={href({ view: v })}
              aria-current={v === view ? "page" : undefined}
              className={v === view ? "font-semibold text-fg" : "text-accent hover:underline"}
            >
              {LABELS[v]}{" "}
              <span className={`tabular-nums ${(v === "unanswered" || v === "pending") && counts[v] ? "font-semibold text-accent" : "text-fg-subtle"}`}>({counts[v]})</span>
            </Link>
          </Fragment>
        ))}
        <span className="ml-auto hidden text-xs text-fg-subtle lg:inline">
          {settings.moderation ? "Moderasi manual: komentar baru menunggu persetujuan." : "Komentar baru langsung tampil (kecuali yang berisi tautan)."}
        </span>
      </nav>

      {/* Filter by page and search (a plain GET form, so the list is a URL). */}
      <form className="flex flex-wrap items-center gap-2" role="search">
        {view !== "all" && <input type="hidden" name="view" value={view} />}
        <select name="halaman" defaultValue={pageId ?? ""} aria-label="Filter halaman" className={`${inputClass} h-8 w-auto max-w-xs pr-8 text-xs`}>
          <option value="">Semua halaman</option>
          {commented.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title || "Tanpa judul"} ({p.n})
            </option>
          ))}
        </select>
        <label className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-fg-subtle" />
          <input name="q" defaultValue={query} placeholder="Cari teks, nama, atau email…" aria-label="Cari komentar" className={`${inputClass} h-8 w-60 pl-8 text-xs sm:w-72`} />
        </label>
        <button type="submit" className={buttonClass("secondary", "sm")}>
          Saring
        </button>
        {(pageId || query) && (
          <Link href={view === "all" ? "/admin/comments" : `/admin/comments?view=${view}`} className="text-xs text-fg-muted hover:text-fg">
            Hapus saringan
          </Link>
        )}
        <span className="ml-auto text-xs text-fg-subtle tabular-nums">{total} item</span>
      </form>

      <CommentsTable rows={rows} view={view} aiEnabled={aiReady} siteName={site.name} />

      {lastPage > 1 && (
        <nav aria-label="Halaman daftar" className="flex items-center justify-end gap-2 text-sm">
          <span className="text-xs text-fg-subtle tabular-nums">
            Halaman {Math.min(page, lastPage)} dari {lastPage}
          </span>
          <Link
            href={href({ view, p: page - 1 })}
            aria-disabled={page <= 1}
            className={`${buttonClass("secondary", "sm")} ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}
            aria-label="Sebelumnya"
          >
            <ChevronLeft className="size-3.5" />
          </Link>
          <Link
            href={href({ view, p: page + 1 })}
            aria-disabled={page >= lastPage}
            className={`${buttonClass("secondary", "sm")} ${page >= lastPage ? "pointer-events-none opacity-40" : ""}`}
            aria-label="Berikutnya"
          >
            <ChevronRight className="size-3.5" />
          </Link>
        </nav>
      )}

      <StaffCommentForm pages={publishedPages} />
    </div>
  );
}
