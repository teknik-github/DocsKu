import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Lock } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/dal";
import { listInternalPages } from "@/lib/data/internal";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = { title: "Artikel internal", robots: { index: false, follow: false } };

/** Hub of internal articles, for signed-in team members only. */
export default function InternalHub() {
  return (
    <>
      <main className="mx-auto max-w-5xl px-5 pt-12 pb-20 sm:px-8">
        <p className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300">
          <Lock className="size-4" />
          Hanya untuk tim
        </p>
        <h1 className="mt-2 font-serif text-4xl font-light tracking-tight text-fg">Artikel internal</h1>
        <p className="mt-3 text-lg text-fg-muted">Panduan dan SOP yang hanya bisa dibaca anggota tim yang masuk. Tidak tampil di situs publik, pencarian, maupun Tanya AI.</p>
        <Suspense fallback={<div className="mt-10 h-64 animate-pulse rounded-xl bg-fill" />}>
          <InternalList />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function InternalList() {
  if (!(await getCurrentUser())) redirect("/admin/login?next=/internal");
  const groups = await listInternalPages();
  if (groups.length === 0) {
    return (
      <p className="mt-10 rounded-xl border border-line bg-surface p-6 text-sm text-fg-muted">
        Belum ada artikel internal yang terbit. Jadikan halaman internal dari editor (Pengaturan halaman) atau dari daftar{" "}
        <Link href="/admin/pages" className="text-accent hover:underline">
          Halaman
        </Link>
        .
      </p>
    );
  }
  return (
    <div className="mt-10 space-y-10">
      {groups.map((group) => (
        <section key={group.id || "none"}>
          {group.group && <p className="text-xs font-semibold tracking-wide text-fg-subtle uppercase">{group.group}</p>}
          <h2 className="text-xl font-semibold text-fg">{group.title}</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {group.pages.map((page) => (
              <li key={page.id}>
                <Link
                  href={`/docs/${page.slug}`}
                  className="group flex h-full items-start justify-between gap-3 rounded-xl border border-line bg-surface p-4 transition-colors hover:border-accent/50"
                >
                  <span className="min-w-0">
                    <span className="block font-medium text-fg group-hover:text-accent">{page.title}</span>
                    {page.description && <span className="mt-1 line-clamp-2 block text-sm text-fg-muted">{page.description}</span>}
                  </span>
                  <ArrowRight className="mt-1 size-4 shrink-0 text-fg-subtle group-hover:text-accent" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
