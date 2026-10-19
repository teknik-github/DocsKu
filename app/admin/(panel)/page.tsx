import Link from "next/link";
import { CalendarClock, FilePen, FileText, Globe, Plus } from "lucide-react";
import { createPage } from "@/app/admin/_actions/pages";
import { requireUser } from "@/lib/auth/dal";
import { getPageStats, listPages, listScheduledPages } from "@/lib/data/admin";
import { formatDateTime } from "@/components/admin/format";
import { PageHeader, Panel, StatusBadge, buttonClass } from "@/components/admin/ui";

export const metadata = { title: "Dasbor" };

export default async function DashboardPage() {
  const user = await requireUser();
  const [stats, recent, scheduled] = await Promise.all([
    getPageStats(),
    listPages().then((pages) => pages.slice(0, 6)),
    listScheduledPages(),
  ]);

  const cards = [
    { label: "Semua halaman", value: stats.total, icon: FileText, href: "/admin/pages" },
    { label: "Terbit", value: stats.published, icon: Globe, href: "/admin/pages?status=published" },
    { label: "Draf", value: stats.draft, icon: FilePen, href: "/admin/pages?status=draft" },
    { label: "Terjadwal", value: stats.scheduled, icon: CalendarClock, href: "/admin/pages?status=scheduled" },
  ];

  return (
    <>
      <PageHeader
        title={`Halo, ${user.name.split(" ")[0]}`}
        description="Ringkasan dokumentasi Anda."
        actions={
          <form action={createPage}>
            <button type="submit" className={buttonClass("accent")}>
              <Plus className="size-4" />
              Halaman baru
            </button>
          </form>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((card) => (
          <Link key={card.label} href={card.href} className="rounded-xl border border-line bg-surface p-4 transition-colors hover:border-line-strong">
            <card.icon className="size-4 text-fg-subtle" />
            <div className="mt-3 text-2xl font-semibold text-fg">{card.value}</div>
            <div className="text-sm text-fg-muted">{card.label}</div>
          </Link>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Panel>
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 className="text-sm font-medium text-fg">Terakhir diubah</h2>
            <Link href="/admin/pages" className="text-xs text-fg-muted hover:text-fg">
              Lihat semua
            </Link>
          </div>
          <ul className="divide-y divide-line">
            {recent.length === 0 && <li className="px-5 py-8 text-center text-sm text-fg-subtle">Belum ada halaman.</li>}
            {recent.map((page) => (
              <li key={page.id}>
                <Link href={`/admin/pages/${page.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-fill/40">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-fg">{page.title || "Tanpa judul"}</span>
                    <span className="block truncate text-xs text-fg-subtle">
                      {formatDateTime(page.updatedAt)}
                      {page.updatedBy && ` · ${page.updatedBy}`}
                    </span>
                  </span>
                  <StatusBadge status={page.status} />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel>
          <div className="border-b border-line px-5 py-3">
            <h2 className="text-sm font-medium text-fg">Jadwal terbit</h2>
          </div>
          <ul className="divide-y divide-line">
            {scheduled.length === 0 && <li className="px-5 py-8 text-center text-sm text-fg-subtle">Tidak ada jadwal.</li>}
            {scheduled.map((page) => (
              <li key={page.id}>
                <Link href={`/admin/pages/${page.id}`} className="block px-5 py-3 hover:bg-fill/40">
                  <span className="block truncate text-sm text-fg">{page.title || "Tanpa judul"}</span>
                  <span className="block text-xs text-sky-700 dark:text-sky-300">{formatDateTime(page.publishedAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}
