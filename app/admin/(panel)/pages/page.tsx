import { Suspense } from "react";
import Link from "next/link";
import { FileQuestion, Files, ListTree, Lock, Plus, Search } from "lucide-react";
import { createPage } from "@/app/admin/_actions/pages";
import { requireUser } from "@/lib/auth/dal";
import { listPages } from "@/lib/data/admin";
import { readNavigation } from "@/lib/automation";
import { categoryGroups, listedIn, type Category } from "@/lib/categories";
import { categoryIcon } from "@/lib/category-icon";
import type { PageStatus } from "@/db/schema";
import type { NavItemData } from "@/lib/site-types";
import { PagesTable } from "@/components/admin/pages-table";
import { CategoryActions, CategoryImage, NewCategoryButton } from "@/components/admin/category-tools";
import { Icon } from "@/components/icon";
import { PageHeader, buttonClass, inputClass } from "@/components/admin/ui";
import { readLanguages } from "@/lib/translations";

export const metadata = { title: "Halaman" };

const FILTERS: { label: string; status?: PageStatus }[] = [
  { label: "Semua" },
  { label: "Terbit", status: "published" },
  { label: "Draf", status: "draft" },
  { label: "Terjadwal", status: "scheduled" },
];

/** `kategori` values besides a section id. */
const ALL = "semua";
const NONE = "tanpa";

export default function PagesPage({ searchParams }: PageProps<"/admin/pages">) {
  return (
    <>
      <PageHeader title="Halaman" description="Kelompokkan halaman ke dalam kategori, lalu tulis halaman baru langsung di kategorinya." />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-fill" />}>
        <PagesView searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function pageOrder(items: NavItemData[]): string[] {
  return items.flatMap((item) => (item.type === "page" ? [item.pageId] : item.type === "group" ? pageOrder(item.items) : []));
}

async function PagesView({ searchParams }: Pick<PageProps<"/admin/pages">, "searchParams">) {
  const user = await requireUser();
  const isAdmin = user.role === "admin";
  const params = await searchParams;
  const status = FILTERS.find((f) => f.status === params.status)?.status;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const [navigation, everyPage, languages] = await Promise.all([readNavigation(), listPages(), readLanguages()]);
  // Translations are listed under their original (badges), or on their own with ?bahasa=<code>.
  const language = languages.languages.find((l) => l.code === params.bahasa)?.code ?? null;
  const translationsOf = new Map<string, typeof everyPage>();
  for (const page of everyPage) {
    if (page.translationOf) translationsOf.set(page.translationOf, [...(translationsOf.get(page.translationOf) ?? []), page]);
  }
  const originals = everyPage.filter((page) => !page.translationOf);
  const allPages = language
    ? everyPage.filter((page) => page.translationOf && page.locale === language)
    : originals;

  const groups = categoryGroups(navigation);
  const categories = new Map<string, Category & { group: string; icon: string }>();
  for (const group of groups) {
    for (const category of group.categories) {
      categories.set(category.id, { ...category, group: group.title, icon: categoryIcon(category.title) });
    }
  }
  const listed = listedIn(navigation);
  /** A page's category: where it is listed, or where it goes on publish. */
  const categoryOf = (page: { id: string; navSection: string | null; translationOf?: string | null }): string | null => {
    // A translation sits in its original's category.
    if (page.translationOf) {
      const original = originals.find((o) => o.id === page.translationOf);
      return original ? categoryOf(original) : null;
    }
    return listed.get(page.id) ?? (page.navSection && categories.has(page.navSection) ? page.navSection : null);
  };

  const counts = new Map<string, number>();
  let uncategorised = 0;
  for (const page of allPages) {
    const id = categoryOf(page);
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    else uncategorised++;
  }

  const wanted = typeof params.kategori === "string" ? params.kategori : ALL;
  const selected = wanted === NONE ? NONE : categories.has(wanted) ? wanted : ALL;
  const current = selected !== ALL && selected !== NONE ? categories.get(selected)! : null;

  const term = q.toLowerCase();
  let pages = allPages.filter(
    (page) =>
      (!status || page.status === status) &&
      (!term || page.title.toLowerCase().includes(term) || page.slug.toLowerCase().includes(term)) &&
      (selected === ALL || (categoryOf(page) ?? NONE) === selected),
  );
  if (current) {
    // Navigation order, then drafts that join on publish (newest first).
    const section = navigation.tabs.flatMap((t) => t.sections).find((s) => s.id === current.id)!;
    const order = new Map(pageOrder(section.items).map((id, i) => [id, i]));
    pages = [...pages].sort((a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity));
  }

  const href = (next: { kategori?: string; status?: PageStatus | null; bahasa?: string | null }) => {
    const query = new URLSearchParams();
    const kategori = next.kategori ?? selected;
    if (kategori !== ALL) query.set("kategori", kategori);
    const s = next.status === undefined ? status : next.status;
    if (s) query.set("status", s);
    if (q) query.set("q", q);
    const b = next.bahasa === undefined ? language : next.bahasa;
    if (b) query.set("bahasa", b);
    const text = query.toString();
    return `/admin/pages${text ? `?${text}` : ""}`;
  };

  const sideLink = (key: string, label: React.ReactNode, count: number, icon: React.ReactNode) => (
    <Link
      key={key}
      href={href({ kategori: key })}
      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
        selected === key ? "bg-surface font-medium text-fg shadow-sm ring-1 ring-line" : "text-fg-muted hover:bg-fill hover:text-fg"
      }`}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="text-xs text-fg-subtle tabular-nums">{count}</span>
    </Link>
  );

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
      {/* Left: categories */}
      <aside className="space-y-4 lg:sticky lg:top-6">
        <nav aria-label="Kategori" className="space-y-4">
          <div className="space-y-0.5">
            {sideLink(ALL, "Semua halaman", allPages.length, <Files className="size-4 shrink-0 text-fg-subtle" />)}
          </div>
          {groups.map((group) => (
            <div key={group.id}>
              <p className="mb-1 px-2.5 text-[11px] font-semibold tracking-wide text-fg-subtle uppercase">{group.title}</p>
              <div className="space-y-0.5">
                {group.categories.map((category) => {
                  const info = categories.get(category.id)!;
                  return sideLink(
                    category.id,
                    category.title,
                    counts.get(category.id) ?? 0,
                    info.image ? (
                      // eslint-disable-next-line @next/next/no-img-element -- uploads are served as-is from /media
                      <img src={info.image} alt="" className="size-5 shrink-0 rounded object-contain" />
                    ) : (
                      <Icon name={info.icon} className="size-4 shrink-0 text-accent" />
                    ),
                  );
                })}
              </div>
            </div>
          ))}
          {allPages.some((page) => page.visibility === "internal") && (
            <a
              href="/internal"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-fg-muted transition-colors hover:bg-fill hover:text-fg"
            >
              <Lock className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span className="min-w-0 flex-1 truncate">Artikel internal</span>
              <span className="text-xs text-fg-subtle tabular-nums">{allPages.filter((page) => page.visibility === "internal").length}</span>
            </a>
          )}
          {(uncategorised > 0 || groups.length === 0) && (
            <div className="space-y-0.5 border-t border-line pt-3">
              {sideLink(NONE, "Tanpa kategori", uncategorised, <FileQuestion className="size-4 shrink-0 text-fg-subtle" />)}
            </div>
          )}
        </nav>
        {isAdmin && (
          <div className="space-y-2 border-t border-line pt-4">
            <NewCategoryButton groups={groups} />
            <Link href="/admin/navigation" className="flex items-center justify-center gap-1.5 text-xs text-fg-subtle hover:text-fg">
              <ListTree className="size-3.5" />
              Atur urutan di Navigasi
            </Link>
          </div>
        )}
      </aside>

      {/* Right: the category's articles */}
      <section className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-line bg-surface p-5">
          <div className="flex min-w-0 items-start gap-4">
            {current && <CategoryImage key={current.id} id={current.id} image={current.image} icon={current.icon} editable={isAdmin} />}
            <div className="min-w-0">
              {current && <p className="text-xs font-medium text-accent">{current.group}</p>}
              <h2 className="truncate text-xl font-semibold text-fg">
                {current ? current.title : selected === NONE ? "Tanpa kategori" : "Semua halaman"}
              </h2>
              <p className="mt-1 text-sm text-fg-muted">
                {current
                  ? `${counts.get(current.id) ?? 0} halaman. Halaman baru di sini langsung masuk kategori ini.`
                  : selected === NONE
                    ? "Halaman yang belum masuk kategori mana pun dan tidak tampil di navigasi situs."
                    : "Semua halaman dokumentasi, termasuk draf dan yang terjadwal."}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {current && isAdmin && <CategoryActions key={current.id} id={current.id} title={current.title} />}
            <form action={createPage}>
              {current && <input type="hidden" name="category" value={current.id} />}
              <button type="submit" className={buttonClass("accent")}>
                <Plus className="size-4" />
                {current ? "Halaman baru di sini" : "Halaman baru"}
              </button>
            </form>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 rounded-lg bg-fill p-1">
            {FILTERS.map((filter) => (
              <Link
                key={filter.label}
                href={href({ status: filter.status ?? null })}
                className={`rounded-md px-3 py-1 text-sm transition-colors ${
                  filter.status === status ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg"
                }`}
              >
                {filter.label}
              </Link>
            ))}
          </div>
          {languages.languages.length > 0 && (
            <div className="flex gap-1 rounded-lg bg-fill p-1" aria-label="Bahasa" data-testid="language-filter">
              {[{ code: null, label: languages.defaultLocale }, ...languages.languages.map((l) => ({ code: l.code, label: l.code }))].map((option) => (
                <Link
                  key={option.label}
                  href={href({ bahasa: option.code })}
                  title={option.code ? `Terjemahan ${languages.languages.find((l) => l.code === option.code)?.label}` : `Halaman asli (${languages.defaultLabel})`}
                  className={`rounded-md px-2.5 py-1 font-mono text-xs uppercase transition-colors ${
                    option.code === language ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg"
                  }`}
                >
                  {option.label}
                </Link>
              ))}
            </div>
          )}
          <form className="relative w-full sm:w-64">
            {selected !== ALL && <input type="hidden" name="kategori" value={selected} />}
            {status && <input type="hidden" name="status" value={status} />}
            {language && <input type="hidden" name="bahasa" value={language} />}
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle" />
            <input name="q" defaultValue={q} placeholder="Cari judul atau slug…" className={`${inputClass} pl-9`} />
          </form>
        </div>

        <PagesTable
          showCategory={selected === ALL}
          moveTargets={isAdmin && groups.length > 0 ? groups : undefined}
          empty={current && !q && !status ? "Belum ada halaman di kategori ini. Klik “Halaman baru di sini” untuk menulis yang pertama." : undefined}
          pages={pages.map((page) => {
            const category = categoryOf(page);
            const info = category ? categories.get(category) : undefined;
            return {
              ...page,
              updatedAt: page.updatedAt.toISOString(),
              publishedAt: page.publishedAt?.toISOString() ?? null,
              category: info ? `${info.group} › ${info.title}` : null,
              pendingCategory: !page.translationOf && Boolean(category) && !listed.has(page.id),
              locale: page.translationOf ? page.locale : null,
              translations: page.translationOf
                ? undefined
                : (translationsOf.get(page.id) ?? []).map((t) => ({ id: t.id, locale: t.locale, status: t.status })),
            };
          })}
        />
      </section>
    </div>
  );
}
