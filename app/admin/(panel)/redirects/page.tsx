import { Suspense } from "react";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth/dal";
import { PageHeader } from "@/components/admin/ui";
import { RedirectsManager, type RedirectRow } from "@/components/admin/redirects-manager";

export const metadata = { title: "Redirect" };

export default function RedirectsPage() {
  return (
    <>
      <PageHeader
        title="Redirect"
        description="Alamat lama di /docs yang dialihkan. Saat slug halaman terbit diubah, alamat lamanya otomatis dialihkan ke halaman itu."
      />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-fill" />}>
        <Redirects />
      </Suspense>
    </>
  );
}

async function Redirects() {
  await requireAdmin();
  const pages = schema.pages;
  const r = schema.redirects;
  const rows = await db
    .select({
      id: r.id,
      from: r.fromPath,
      toUrl: r.toUrl,
      auto: r.auto,
      hits: r.hits,
      lastHitAt: r.lastHitAt,
      createdAt: r.createdAt,
      pageId: pages.id,
      pageTitle: pages.title,
      pageSlug: pages.slug,
      pageStatus: pages.status,
      shadowed: sql<boolean>`exists (select 1 from ${pages} p2 where p2.slug = ${r.fromPath} and p2.status = 'published')`,
    })
    .from(r)
    .leftJoin(pages, eq(pages.id, r.pageId))
    .orderBy(desc(r.createdAt));

  const list: RedirectRow[] = rows.map((row) => ({
    id: row.id,
    from: `/docs/${row.from}`,
    to: row.pageSlug ? `/docs/${row.pageSlug}` : (row.toUrl ?? ""),
    page: row.pageId ? { id: row.pageId, title: row.pageTitle || "Tanpa judul" } : null,
    auto: row.auto,
    hits: row.hits,
    lastHitAt: row.lastHitAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    inactive: row.shadowed ? "shadowed" : row.pageId && row.pageStatus !== "published" ? "unpublished" : null,
  }));
  return <RedirectsManager rows={list} />;
}
