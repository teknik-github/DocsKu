import { Suspense } from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { createPage } from "@/app/admin/_actions/pages";
import { requireUser } from "@/lib/auth/dal";
import { listPages } from "@/lib/data/admin";
import type { PageStatus } from "@/db/schema";
import { PagesTable } from "@/components/admin/pages-table";
import { PageHeader, buttonClass, inputClass } from "@/components/admin/ui";

export const metadata = { title: "Halaman" };

const FILTERS: { label: string; status?: PageStatus }[] = [
  { label: "Semua" },
  { label: "Terbit", status: "published" },
  { label: "Draf", status: "draft" },
  { label: "Terjadwal", status: "scheduled" },
];

export default function PagesPage({ searchParams }: PageProps<"/admin/pages">) {
  return (
    <>
      <PageHeader
        title="Halaman"
        description="Semua halaman dokumentasi, termasuk draf dan yang terjadwal."
        actions={
          <form action={createPage}>
            <button type="submit" className={buttonClass("accent")}>
              <Plus className="size-4" />
              Halaman baru
            </button>
          </form>
        }
      />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-fill" />}>
        <PagesList searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function PagesList({ searchParams }: Pick<PageProps<"/admin/pages">, "searchParams">) {
  await requireUser();
  const params = await searchParams;
  const status = FILTERS.find((f) => f.status === params.status)?.status;
  const q = typeof params.q === "string" ? params.q : "";
  const pages = await listPages({ status, q });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg bg-fill p-1">
          {FILTERS.map((filter) => {
            const active = filter.status === status;
            const href = filter.status ? `/admin/pages?status=${filter.status}` : "/admin/pages";
            return (
              <Link
                key={filter.label}
                href={href}
                className={`rounded-md px-3 py-1 text-sm transition-colors ${
                  active ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg"
                }`}
              >
                {filter.label}
              </Link>
            );
          })}
        </div>
        <form className="relative w-full sm:w-64">
          {status && <input type="hidden" name="status" value={status} />}
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle" />
          <input name="q" defaultValue={q} placeholder="Cari judul atau slug…" className={`${inputClass} pl-9`} />
        </form>
      </div>

      <PagesTable
        pages={pages.map((page) => ({
          ...page,
          updatedAt: page.updatedAt.toISOString(),
          publishedAt: page.publishedAt?.toISOString() ?? null,
        }))}
      />
    </>
  );
}
