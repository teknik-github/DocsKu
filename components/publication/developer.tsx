import Link from "next/link";
import { ArrowRight, ChevronRight, Terminal } from "lucide-react";
import { findTab, getPager, locate, sectionPages } from "@/lib/navigation";
import type { NavTab, PageCard, SiteSettings } from "@/lib/site-types";
import { RenderDoc } from "@/lib/content/render";
import { tocHeadings } from "@/lib/content/doc";
import { CopyPageButton } from "@/components/copy-page-button";
import { SearchField } from "@/components/search";
import { SidebarNav } from "@/components/sidebar";
import { SiteFooter } from "@/components/site-footer";
import { TableOfContents } from "@/components/toc";
import { type ArticleData, InlineToc, markdownOf } from "@/components/publication/articles";
import { CategoryBadge } from "@/components/publication/parts";
import { LocalDate, T } from "@/components/locale-text";
import { AuthorByline } from "@/components/author";

/** "Pengembang": an API-reference style layout (three columns and a tab strip). */

const sticky = "sticky top-[calc(var(--header-h)+3.25rem)] max-h-[calc(100vh-var(--header-h)-4.5rem)] overflow-y-auto";

/** The tabs as a strip of underlined links under the header. */
function TabStrip({ tabs, active }: { tabs: NavTab[]; active?: string }) {
  if (tabs.length < 2) return null;
  return (
    <div className="sticky top-(--header-h) z-20 border-b border-line bg-page/95 backdrop-blur">
      <nav aria-label="Topik" className="mx-auto flex max-w-[96rem] gap-6 overflow-x-auto px-5 sm:px-8">
        {tabs.map((tab) => {
          const on = tab.title === active;
          return (
            <Link
              key={tab.title}
              href={tab.href}
              prefetch={true}
              aria-current={on ? "page" : undefined}
              className={`-mb-px shrink-0 border-b-2 py-2.5 text-sm whitespace-nowrap transition-colors ${
                on ? "border-accent font-medium text-fg" : "border-transparent text-fg-muted hover:text-fg"
              }`}
            >
              {tab.title}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function DeveloperHub({ site, tabs, cards }: { site: SiteSettings; tabs: NavTab[]; cards: Map<string, PageCard> }) {
  const first = tabs[0]?.href;
  return (
    <>
      <section className="border-b border-line bg-fg text-page">
        <div className="mx-auto grid max-w-[96rem] grid-cols-[minmax(0,1fr)] items-center gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:py-20">
          <div>
            <p className="font-mono text-xs tracking-wide text-page/60">{site.name.toLowerCase().replace(/\s+/g, "-")} / docs</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
              <T k="docsOf" vars={{ name: site.name }} />
            </h1>
            {site.description && <p className="mt-4 max-w-xl text-lg text-page/70">{site.description}</p>}
            <div className="mt-8 flex flex-wrap items-center gap-3">
              {first && (
                <Link href={first} prefetch={true} className="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-white hover:opacity-90">
                  <T k="startHere" />
                  <ArrowRight className="size-4" />
                </Link>
              )}
              <SearchField label={<T k="searchInDocs" />} className="h-10! w-72! max-w-full border-page/20! bg-page/10! text-page/70!" />
            </div>
          </div>
          {/* A decorative "terminal" with the first pages, as a quick start. */}
          <div className="hidden overflow-hidden rounded-xl border border-page/15 bg-page/5 font-mono text-[13px] lg:block">
            <div className="flex items-center gap-1.5 border-b border-page/15 px-4 py-2.5">
              {[0, 1, 2].map((i) => (
                <span key={i} className="size-2.5 rounded-full bg-page/25" />
              ))}
              <span className="ml-2 flex items-center gap-1.5 text-xs text-page/50">
                <Terminal className="size-3.5" />
                mulai-cepat
              </span>
            </div>
            <ol className="space-y-1.5 p-4">
              {tabs.flatMap((tab) => tab.sections.flatMap(sectionPages)).slice(0, 5).map((page, i) => (
                <li key={page.href}>
                  <Link href={page.href} prefetch={true} className="group flex gap-3 text-page/75 hover:text-page">
                    <span className="text-page/35">{String(i + 1).padStart(2, "0")}</span>
                    <span className="text-accent-soft">$</span>
                    <span className="truncate group-hover:underline">{page.title}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-[96rem] px-5 pt-12 pb-24 sm:px-8">
        {tabs.length === 0 && (
          <p className="text-sm text-fg-muted">
            <T k="noPages" />
          </p>
        )}
        {tabs.map((tab) => (
          <section key={tab.title} className="mb-14">
            <div className="mb-5 flex items-baseline justify-between gap-4 border-b border-line pb-3">
              <h2 className="text-xl font-semibold tracking-tight text-fg">{tab.title}</h2>
              <Link href={tab.href} prefetch={true} className="flex items-center gap-1 text-sm text-accent hover:underline">
                <T k="open" />
                <ChevronRight className="size-3.5" />
              </Link>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {tab.sections.map((section) => {
                const pages = sectionPages(section);
                if (!pages.length) return null;
                return (
                  <div key={section.title} className="min-w-0">
                    <div className="mb-2 flex items-center gap-2">
                      <CategoryBadge title={section.title} image={section.image} size="sm" />
                      <h3 className="text-sm font-semibold text-fg">{section.title}</h3>
                    </div>
                    <ul className="space-y-1 border-l border-line pl-3">
                      {pages.map((page) => (
                        <li key={page.href}>
                          <Link href={page.href} prefetch={true} className="group block text-sm text-fg-muted hover:text-accent">
                            {page.title}
                            {cards.get(page.href)?.description && <span className="block truncate text-xs text-fg-subtle">{cards.get(page.href)!.description}</span>}
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
    </>
  );
}

export function DeveloperArticle({
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
  const tab = findTab(tabs, article.href);
  const place = locate(tabs, article.href);
  const { prev, next } = getPager(tabs, article.href);

  return (
    <>
      <TabStrip tabs={tabs} active={tab?.title} />
      <div className="mx-auto grid max-w-[96rem] grid-cols-[minmax(0,1fr)] gap-10 px-5 pt-8 pb-20 sm:px-8 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_16rem]">
        <aside className="hidden lg:block">
          <div className={sticky}>{tab && <SidebarNav tab={tab} />}</div>
        </aside>

        <article className="min-w-0">
          {banner}
          <header className="mb-8">
            {place && (
              <p className="font-mono text-xs text-fg-subtle">
                {place.tab.title} <span className="text-fg-subtle/60">/</span> <span className="text-accent">{place.section.title}</span>
              </p>
            )}
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">{article.title}</h1>
            {article.description && <p className="mt-3 max-w-3xl text-lg text-fg-muted">{article.description}</p>}
            <AuthorByline author={article.author} className="mt-4" />
            <div className="mt-4 xl:hidden">
              <CopyPageButton markdown={markdownOf(article)} />
            </div>
          </header>
          <InlineToc doc={article.doc} className="xl:hidden" />
          <div className="prose-docs prose-dev max-w-4xl">
            <RenderDoc doc={article.doc} />
          </div>
          <div className="max-w-4xl">{footer}</div>

          {(prev || next) && (
            <nav aria-label="Navigasi halaman" className="mt-14 flex max-w-4xl items-stretch justify-between gap-4 border-t border-line pt-6">
              {prev ? (
                <Link href={prev.href} prefetch={true} className="group min-w-0 text-sm">
                  <span className="block font-mono text-[11px] text-fg-subtle lowercase">
                    ← <T k="prev" />
                  </span>
                  <span className="block truncate font-medium text-fg group-hover:text-accent">{prev.title}</span>
                </Link>
              ) : (
                <span />
              )}
              {next && (
                <Link href={next.href} prefetch={true} className="group min-w-0 text-right text-sm">
                  <span className="block font-mono text-[11px] text-fg-subtle lowercase">
                    <T k="next" /> →
                  </span>
                  <span className="block truncate font-medium text-fg group-hover:text-accent">{next.title}</span>
                </Link>
              )}
            </nav>
          )}
        </article>

        <aside className="hidden xl:block">
          <div className={`${sticky} space-y-6`}>
            <div className="rounded-lg border border-line bg-surface p-3">
              <p className="mb-2 font-mono text-[11px] text-fg-subtle">
                <T k="pageWord" />
              </p>
              <CopyPageButton markdown={markdownOf(article)} />
              <p className="mt-3 text-xs text-fg-subtle">
                {article.publishedAt && (
                  <>
                    <T k="updated" /> <LocalDate value={article.publishedAt} /> ·{" "}
                  </>
                )}
                <T k="minRead" vars={{ n: article.readingMinutes }} />
              </p>
            </div>
            <TableOfContents headings={tocHeadings(article.doc)} />
          </div>
        </aside>
      </div>
      <SiteFooter />
    </>
  );
}
