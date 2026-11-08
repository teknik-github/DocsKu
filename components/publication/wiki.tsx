import Link from "next/link";
import { ChevronRight, FileText } from "lucide-react";
import { allPages, groupContains, isGroup, locate } from "@/lib/navigation";
import type { NavItem, NavTab, PageCard } from "@/lib/site-types";
import { RenderDoc } from "@/lib/content/render";
import { tocHeadings } from "@/lib/content/doc";
import { CopyPageButton } from "@/components/copy-page-button";
import { SearchField } from "@/components/search";
import { SiteFooter } from "@/components/site-footer";
import { TableOfContents } from "@/components/toc";
import { type ArticleData, InlineToc, markdownOf } from "@/components/publication/articles";
import { Breadcrumb } from "@/components/publication/parts";
import { HubLink, LocalDate, T } from "@/components/locale-text";
import { AuthorByline } from "@/components/author";

/** "Wiki": compact, with the whole tree always at hand and an A–Z index. */

const sticky = "sticky top-[calc(var(--header-h)+1.25rem)] max-h-[calc(100vh-var(--header-h)-2rem)] overflow-y-auto";

function TreeItem({ item, current }: { item: NavItem; current?: string }) {
  if (isGroup(item)) {
    return (
      <li>
        <details open={current ? groupContains(item, current) : false} className="group/item">
          <summary className="flex cursor-pointer list-none items-center gap-1 rounded px-1.5 py-1 text-fg-muted hover:bg-fill hover:text-fg [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-3 shrink-0 transition-transform group-open/item:rotate-90" />
            <span className="truncate">{item.title}</span>
          </summary>
          <ul className="ml-2.5 border-l border-line pl-1.5">
            {item.items.map((child) => (
              <TreeItem key={child.title} item={child} current={current} />
            ))}
          </ul>
        </details>
      </li>
    );
  }
  const active = item.href === current;
  return (
    <li>
      <Link
        href={item.href}
        prefetch={true}
        aria-current={active ? "page" : undefined}
        className={`block truncate rounded px-1.5 py-1 ${active ? "bg-accent-soft font-medium text-accent" : "text-fg-muted hover:bg-fill hover:text-fg"}`}
      >
        {item.title}
      </Link>
    </li>
  );
}

/** Every tab, section and page; the tab holding the current page starts open. */
function WikiTree({ tabs, current }: { tabs: NavTab[]; current?: string }) {
  return (
    <nav aria-label="Semua halaman" className="text-[13px] leading-snug">
      <SearchField className="mb-4 h-8! text-xs!" />
      <HubLink className={`mb-2 flex items-center gap-1.5 rounded px-1.5 py-1 font-medium ${current ? "text-fg-muted hover:text-fg" : "text-accent"}`}>
        <T k="azIndex" />
      </HubLink>
      <ul className="space-y-1">
        {tabs.map((tab) => {
          const open = !current || tab.sections.some((s) => s.items.some((item) => groupContains(item, current)));
          return (
            <li key={tab.title}>
              <details open={open} className="group/tab">
                <summary className="flex cursor-pointer list-none items-center gap-1 rounded px-1.5 py-1 text-xs font-semibold tracking-wide text-fg uppercase hover:bg-fill [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="size-3 shrink-0 transition-transform group-open/tab:rotate-90" />
                  {tab.title}
                </summary>
                {tab.sections.map((section) => (
                  <div key={section.title} className="mt-1 mb-2 ml-2">
                    <p className="px-1.5 py-0.5 text-[11px] text-fg-subtle">{section.title}</p>
                    <ul>
                      {section.items.map((item) => (
                        <TreeItem key={item.title} item={item} current={current} />
                      ))}
                    </ul>
                  </div>
                ))}
              </details>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

const letterOf = (title: string) => {
  const c = title.trim().charAt(0).toUpperCase().normalize("NFKD").charAt(0);
  return /[A-Z]/.test(c) ? c : "#";
};

export function WikiHub({ tabs, cards }: { tabs: NavTab[]; cards: Map<string, PageCard> }) {
  const pages = allPages(tabs).sort((a, b) => a.title.localeCompare(b.title, "id"));
  const byLetter = new Map<string, typeof pages>();
  for (const page of pages) {
    const letter = letterOf(page.title);
    byLetter.set(letter, [...(byLetter.get(letter) ?? []), page]);
  }
  const letters = [...byLetter.keys()].sort((a, b) => (a === "#" ? 1 : b === "#" ? -1 : a.localeCompare(b)));
  const sections = tabs.reduce((n, t) => n + t.sections.length, 0);

  return (
    <div className="mx-auto grid max-w-[88rem] grid-cols-[minmax(0,1fr)] gap-10 px-5 pt-8 pb-20 sm:px-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="hidden lg:block">
        <div className={sticky}>
          <WikiTree tabs={tabs} />
        </div>
      </aside>
      <main className="min-w-0">
        <h1 className="border-b border-line pb-3 text-3xl font-semibold tracking-tight text-fg">
          <T k="azIndex" />
        </h1>
        <p className="mt-3 text-sm text-fg-muted">
          <T k="wikiStats" vars={{ pages: pages.length, sections }} />
        </p>
        {letters.length > 0 && (
          <nav aria-label="Huruf" className="sticky top-(--header-h) z-10 -mx-1 mt-5 flex flex-wrap gap-1 bg-page/95 py-2 backdrop-blur">
            {letters.map((letter) => (
              <a key={letter} href={`#huruf-${letter}`} className="inline-flex size-7 items-center justify-center rounded border border-line text-xs font-medium text-fg-muted hover:border-accent hover:text-accent">
                {letter}
              </a>
            ))}
          </nav>
        )}
        {pages.length === 0 && (
          <p className="mt-10 text-sm text-fg-muted">
            <T k="noPages" />
          </p>
        )}
        <div className="mt-6 columns-1 gap-10 md:columns-2 2xl:columns-3">
          {letters.map((letter) => (
            <section key={letter} id={`huruf-${letter}`} className="mb-8 break-inside-avoid scroll-mt-32">
              <h2 className="mb-2 border-b border-line pb-1 font-serif text-2xl text-accent">{letter}</h2>
              <ul className="space-y-1.5 text-sm">
                {byLetter.get(letter)!.map((page) => (
                  <li key={page.href}>
                    <Link href={page.href} prefetch={true} className="group block">
                      <span className="text-fg group-hover:text-accent group-hover:underline">{page.title}</span>
                      <span className="text-xs text-fg-subtle"> · {page.section}</span>
                      {cards.get(page.href)?.description && <span className="block truncate text-xs text-fg-subtle">{cards.get(page.href)!.description}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}

export function WikiArticle({
  article,
  tabs,
  banner,
  footer,
}: {
  article: ArticleData;
  tabs: NavTab[];
  banner?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const place = locate(tabs, article.href);
  const headings = tocHeadings(article.doc);
  const seeAlso = place ? place.pages.filter((p) => p.href !== article.href) : [];

  return (
    <>
      <div className="mx-auto grid max-w-[88rem] grid-cols-[minmax(0,1fr)] gap-10 px-5 pt-6 pb-20 sm:px-8 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_14rem]">
        <aside className="hidden lg:block">
          <div className={sticky}>
            <WikiTree tabs={tabs} current={article.href} />
          </div>
        </aside>

        <article className="min-w-0">
          {banner}
          <Breadcrumb place={place} className="text-xs" />
          <header className="mt-3 mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
            <h1 className="font-serif text-3xl leading-tight text-fg sm:text-[2.1rem]">{article.title}</h1>
            <CopyPageButton markdown={markdownOf(article)} />
          </header>
          {article.description && <p className="mb-6 text-[15px] text-fg-muted italic">{article.description}</p>}
          <AuthorByline author={article.author} className="mb-6" />
          <InlineToc doc={article.doc} className="xl:hidden" />
          <div className="prose-docs prose-wiki">
            <RenderDoc doc={article.doc} />
          </div>
          {seeAlso.length > 0 && (
            <section className="mt-12 rounded-lg border border-line bg-surface/60 px-4 py-3 text-sm">
              <h2 className="mb-1.5 text-xs font-semibold tracking-wide text-fg-subtle uppercase">
                <T k="seeAlso" /> · {place!.section.title}
              </h2>
              <p className="leading-relaxed">
                {seeAlso.map((page, i) => (
                  <span key={page.href}>
                    {i > 0 && <span className="px-1.5 text-fg-subtle">·</span>}
                    <Link href={page.href} prefetch={true} className="text-accent hover:underline">
                      {page.title}
                    </Link>
                  </span>
                ))}
              </p>
            </section>
          )}
          {footer}
        </article>

        <aside className="hidden xl:block">
          <div className={`${sticky} space-y-6`}>
            <dl className="rounded-lg border border-line bg-surface p-3 text-xs">
              <p className="mb-2 flex items-center gap-1.5 font-semibold text-fg">
                <FileText className="size-3.5 text-accent" />
                <T k="pageInfo" />
              </p>
              {place && <InfoRow label={<T k="topic" />} value={place.tab.title} />}
              {place && <InfoRow label={<T k="section" />} value={place.section.title} />}
              {article.publishedAt && <InfoRow label={<T k="published" />} value={<LocalDate value={article.publishedAt} />} />}
              <InfoRow label={<T k="readingTime" />} value={<T k="minutes" vars={{ n: article.readingMinutes }} />} />
              <InfoRow label={<T k="subheadings" />} value={String(headings.length)} />
            </dl>
            <TableOfContents headings={headings} />
          </div>
        </aside>
      </div>
      <SiteFooter />
    </>
  );
}

function InfoRow({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-t border-line py-1.5 first-of-type:border-0">
      <dt className="text-fg-subtle">{label}</dt>
      <dd className="truncate text-right text-fg-muted">{value}</dd>
    </div>
  );
}
