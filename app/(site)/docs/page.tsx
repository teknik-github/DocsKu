import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getNavigation, getPageCards, getSiteSettings } from "@/lib/data/site";
import { GhostHub, HybridHub } from "@/components/publication/hubs";
import { tabPages } from "@/lib/navigation";
import { SiteFooter } from "@/components/site-footer";

export const metadata = { title: "Dokumentasi" };

/** Overview of every tab and section, linking to each page. */
export default async function DocsIndex() {
  const [tabs, site] = await Promise.all([getNavigation(), getSiteSettings()]);
  const layout = site.layout ?? "docs";
  if (layout !== "docs") {
    const cards = new Map((await getPageCards()).map((card) => [card.href, card]));
    return (
      <>
        {layout === "ghost" ? <GhostHub site={site} tabs={tabs} cards={cards} /> : <HybridHub tabs={tabs} cards={cards} />}
        <SiteFooter />
      </>
    );
  }

  return (
    <>
      <main className="mx-auto max-w-5xl px-5 pt-12 pb-20 sm:px-8">
        <h1 className="font-serif text-4xl font-light tracking-tight text-fg">Dokumentasi</h1>
        <p className="mt-3 text-lg text-fg-muted">Semua panduan dan referensi dalam satu tempat.</p>

        {tabs.length === 0 && (
          <p className="mt-10 rounded-xl border border-line bg-surface p-6 text-sm text-fg-muted">
            Belum ada halaman yang diterbitkan.
          </p>
        )}

        {tabs.map((tab) => (
          <section key={tab.title} className="mt-12">
            <h2 className="text-xl font-semibold text-fg">{tab.title}</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {tab.sections.map((section) => {
                const pages = tabPages({ ...tab, sections: [section] });
                return (
                  <div key={section.title} className="rounded-xl border border-line bg-surface p-5">
                    <h3 className="text-sm font-medium text-fg">{section.title}</h3>
                    <ul className="mt-3 space-y-1.5">
                      {pages.map((page) => (
                        <li key={page.href}>
                          <Link
                            href={page.href}
                            className="group flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg"
                          >
                            {page.title}
                            <ArrowRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </main>
      <SiteFooter />
    </>
  );
}
