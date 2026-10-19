import { Suspense } from "react";
import { allPages, sectionPages } from "@/lib/navigation";
import type { NavTab, PageCard, SiteSettings } from "@/lib/site-types";
import { SearchField } from "@/components/search";
import { PageCardView } from "@/components/publication/cards";
import { GhostGrid, type GhostItem } from "@/components/publication/ghost-grid";

/** Hybrid layout: the docs hub as card grids, one per section. */
export function HybridHub({ tabs, cards }: { tabs: NavTab[]; cards: Map<string, PageCard> }) {
  return (
    <main className="mx-auto max-w-6xl px-5 pt-14 pb-24 sm:px-8">
      <header className="max-w-2xl">
        <h1 className="font-serif text-4xl font-light tracking-tight text-fg sm:text-5xl">Dokumentasi</h1>
        <p className="mt-4 text-lg text-fg-muted">Semua panduan dan referensi, dikelompokkan per bagian.</p>
        <SearchField className="mt-8 h-11 max-w-md" />
      </header>

      {tabs.length === 0 && <p className="mt-12 text-sm text-fg-muted">Belum ada halaman yang diterbitkan.</p>}

      {tabs.map((tab) => (
        <section key={tab.title} className="mt-20">
          <h2 className="border-b border-line pb-4 font-serif text-3xl font-light tracking-tight text-fg">{tab.title}</h2>
          {tab.sections.map((section) => {
            const items = sectionPages(section).flatMap((link) => {
              const card = cards.get(link.href);
              return card ? [card] : [];
            });
            if (items.length === 0) return null;
            return (
              <div key={section.title} className="mt-10">
                <h3 className="mb-5 text-sm font-semibold tracking-wide text-fg-muted uppercase">{section.title}</h3>
                <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((card) => (
                    <PageCardView key={card.href} card={card} tag={section.title} />
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      ))}
    </main>
  );
}

/** Ghost layout: a hero band, topic chips, and one grid with featured pages first. */
export function GhostHub({ site, tabs, cards }: { site: SiteSettings; tabs: NavTab[]; cards: Map<string, PageCard> }) {
  const items: GhostItem[] = allPages(tabs).flatMap((page) => {
    const card = cards.get(page.href);
    return card ? [{ card, tag: page.section, tab: page.tab }] : [];
  });
  // Featured first; otherwise keep the navigation order.
  items.sort((a, b) => Number(b.card.featured) - Number(a.card.featured));

  return (
    <>
      <section
        className="border-b border-line"
        style={{
          background:
            "radial-gradient(ellipse at top, color-mix(in srgb, var(--accent) 18%, transparent), transparent 70%), var(--page)",
        }}
      >
        <div className="mx-auto max-w-6xl px-5 py-20 text-center sm:px-8 lg:py-28">
          <h1 className="font-serif text-5xl font-light tracking-tight text-fg sm:text-6xl">{site.name}</h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-fg-muted">{site.description}</p>
          <SearchField className="mx-auto mt-8 h-11 max-w-md" />
        </div>
      </section>
      <main className="mx-auto max-w-6xl px-5 pt-12 pb-24 sm:px-8">
        <Suspense fallback={<GhostGridFallback items={items} />}>
          <GhostGrid items={items} tabs={tabs.map((tab) => tab.title)} />
        </Suspense>
      </main>
    </>
  );
}

/** Shown while the client grid reads the ?topik= filter: every card, unfiltered. */
function GhostGridFallback({ items }: { items: GhostItem[] }) {
  return (
    <div className="mt-[4.5rem] grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <PageCardView key={item.card.href} card={item.card} tag={item.tag} showFeatured />
      ))}
    </div>
  );
}
