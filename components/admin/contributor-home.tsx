import Link from "next/link";
import { and, desc, eq, or } from "drizzle-orm";
import { ChevronRight, Clock, FilePen, MessageSquareWarning, Plus, Sparkles } from "lucide-react";
import { db, schema } from "@/db";
import type { SessionUser } from "@/lib/auth/dal";
import { NewPageButton } from "@/components/admin/new-page-button";
import { Panel, StatusBadge, buttonClass } from "@/components/admin/ui";
import { formatDateTime } from "@/components/admin/format";

/**
 * The dashboard for a contributor: their own pages, the ones sent back with a
 * note first, then the ones waiting for approval, then drafts.
 */
export async function ContributorHome({ user, greeting, today }: { user: SessionUser; greeting: string; today: string }) {
  const pages = await db
    .select({
      id: schema.pages.id,
      title: schema.pages.draftTitle,
      status: schema.pages.status,
      hasChanges: schema.pages.hasChanges,
      approvalStatus: schema.pages.approvalStatus,
      approvalNote: schema.pages.approvalNote,
      updatedAt: schema.pages.updatedAt,
    })
    .from(schema.pages)
    .where(and(eq(schema.pages.kind, "doc"), or(eq(schema.pages.authorId, user.id), eq(schema.pages.ownerId, user.id))))
    .orderBy(desc(schema.pages.updatedAt))
    .limit(100);

  const returned = pages.filter((p) => p.approvalStatus === "changes_requested");
  const waiting = pages.filter((p) => p.approvalStatus === "pending");
  const drafts = pages.filter((p) => !p.approvalStatus && (p.status === "draft" || p.hasChanges));
  const published = pages.filter((p) => p.status === "published" && !p.hasChanges && !p.approvalStatus);

  const row = (page: (typeof pages)[number], extra?: React.ReactNode) => (
    <li key={page.id}>
      <Link href={`/admin/pages/${page.id}`} className="group flex items-start gap-3 px-5 py-3 hover:bg-fill/40">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-fg group-hover:text-accent">{page.title || "Tanpa judul"}</span>
          {extra}
          <span className="mt-0.5 block text-xs text-fg-subtle">Diubah {formatDateTime(page.updatedAt.toISOString())}</span>
        </span>
        <StatusBadge status={page.status} />
        <ChevronRight className="mt-0.5 size-4 text-fg-subtle group-hover:text-fg" />
      </Link>
    </li>
  );

  return (
    <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-fg-subtle first-letter:uppercase">{today}</p>
          <h1 className="mt-1 font-serif text-3xl font-light tracking-tight text-fg">
            {greeting}, {user.name.split(" ")[0]}
          </h1>
          <p className="mt-1.5 text-sm text-fg-muted">Tulis halaman, lalu ajukan untuk ditinjau. Editor atau admin yang menerbitkannya.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/ai" className={buttonClass("secondary")}>
            <Sparkles className="size-4" />
            AI Chat
          </Link>
          <NewPageButton className={buttonClass("accent")}>
            <Plus className="size-4" />
            Halaman baru
          </NewPageButton>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
        {returned.length > 0 && (
          <Panel className="lg:col-span-2">
            <h2 className="flex items-center gap-2 border-b border-line px-5 py-3 text-sm font-medium text-orange-800 dark:text-orange-200">
              <MessageSquareWarning className="size-4" />
              Diminta perubahan ({returned.length})
            </h2>
            <ul className="divide-y divide-line">
              {returned.map((page) => row(page, page.approvalNote && <span className="mt-0.5 block text-xs text-orange-800 dark:text-orange-200">Catatan peninjau: {page.approvalNote}</span>))}
            </ul>
          </Panel>
        )}
        <Panel>
          <h2 className="flex items-center gap-2 border-b border-line px-5 py-3 text-sm font-medium text-fg">
            <Clock className="size-4 text-sky-600 dark:text-sky-400" />
            Menunggu persetujuan ({waiting.length})
          </h2>
          {waiting.length ? <ul className="divide-y divide-line">{waiting.map((page) => row(page))}</ul> : <p className="px-5 py-4 text-sm text-fg-subtle">Belum ada halaman yang Anda ajukan.</p>}
        </Panel>
        <Panel>
          <h2 className="flex items-center gap-2 border-b border-line px-5 py-3 text-sm font-medium text-fg">
            <FilePen className="size-4 text-fg-subtle" />
            Draf saya ({drafts.length})
          </h2>
          {drafts.length ? (
            <ul className="divide-y divide-line">{drafts.slice(0, 8).map((page) => row(page))}</ul>
          ) : (
            <p className="px-5 py-4 text-sm text-fg-subtle">Tidak ada draf. Klik &ldquo;Halaman baru&rdquo; untuk mulai menulis.</p>
          )}
        </Panel>
        {published.length > 0 && (
          <Panel className="lg:col-span-2">
            <h2 className="border-b border-line px-5 py-3 text-sm font-medium text-fg">Sudah terbit ({published.length})</h2>
            <ul className="divide-y divide-line">{published.slice(0, 8).map((page) => row(page))}</ul>
          </Panel>
        )}
      </div>
    </>
  );
}
