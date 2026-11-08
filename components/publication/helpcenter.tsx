import Link from "next/link";
import { ArrowRight, ChevronDown, Clock, FileText, LifeBuoy } from "lucide-react";
import { locate, topicSlug } from "@/lib/navigation";
import type { NavTab, PageCard, SiteSettings } from "@/lib/site-types";
import { RenderDoc } from "@/lib/content/render";
import { CopyPageButton } from "@/components/copy-page-button";
import { SearchField } from "@/components/search";
import { SiteFooter } from "@/components/site-footer";
import { type ArticleData, InlineToc, markdownOf, SideToc } from "@/components/publication/articles";
import { Breadcrumb, CategoryBadge, categoriesOf, popularFirst } from "@/components/publication/parts";
import { LocalDate, T } from "@/components/locale-text";
import { AuthorByline } from "@/components/author";

/** "Pusat bantuan": a help centre (Helpjuice/Zendesk style). */

const SHOWN = 4;

export function HelpCenterHub({
  site,
  tabs,
  cards,
  popular,
}: {
  site: SiteSettings;
  tabs: NavTab[];
  cards: Map<string, PageCard>;
  popular: string[];
}) {
  const categories = categoriesOf(tabs);
  const titles = new Map(categories.flatMap((c) => c.pages.map((p) => [p.href, { title: p.title, category: c.section.title }] as const)));
  const top = popularFirst(
    popular,
    [...cards.values()].filter((c) => c.featured).map((c) => c.href).concat(categories.flatMap((c) => c.pages.map((p) => p.href))),
    6,
  ).filter((href) => titles.has(href));

  return (
    <>
      <section className="relative overflow-hidden bg-accent text-white">
        <div
          aria-hidden
          className="absolute inset-0 opacity-20"
          style={{ backgroundImage: "radial-gradient(circle at 20% 10%, white 0, transparent 35%), radial-gradient(circle at 85% 90%, white 0, transparent 30%)" }}
        />
        <div className="relative mx-auto max-w-3xl px-5 py-16 text-center sm:px-8 lg:py-24">
          <p className="text-sm font-medium text-white/80">
            {site.name} · <T k="helpCenter" />
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">
            <T k="helpHeadline" />
          </h1>
          {site.description && <p className="mx-auto mt-4 max-w-xl text-base text-white/85 sm:text-lg">{site.description}</p>}
          <SearchField label={<T k="searchHelp" />} className="mx-auto mt-8 h-12! max-w-xl rounded-xl! border-transparent! bg-surface! text-base! shadow-lg" />
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-5 pt-14 pb-24 sm:px-8">
        {categories.length === 0 && (
          <p className="text-sm text-fg-muted">
            <T k="noArticles" />
          </p>
        )}

        {tabs.map((tab) => {
          const inTab = categories.filter((c) => c.tab === tab);
          if (!inTab.length) return null;
          return (
            <section key={tab.title} id={topicSlug(tab.title)} className="mb-16 scroll-mt-24">
              {tabs.length > 1 && <h2 className="mb-6 text-xl font-semibold tracking-tight text-fg">{tab.title}</h2>}
              <div className="grid grid-cols-[minmax(0,1fr)] gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {inTab.map(({ section, pages }) => (
                  <article key={section.title} className="flex flex-col rounded-2xl border border-line bg-surface p-6 transition-colors hover:border-line-strong">
                    <div className="flex items-start gap-4">
                      <CategoryBadge title={section.title} image={section.image} size="lg" />
                      <div className="min-w-0">
                        <h3 className="text-base font-semibold text-fg">
                          <Link href={pages[0].href} prefetch={true} className="hover:text-accent">
                            {section.title}
                          </Link>
                        </h3>
                        <p className="mt-0.5 text-xs text-fg-subtle">
                          <T k="articles" vars={{ n: pages.length }} />
                        </p>
                      </div>
                    </div>
                    <ul className="mt-5 space-y-0.5 border-t border-line pt-3">
                      {pages.slice(0, SHOWN).map((page) => (
                        <ArticleRow key={page.href} href={page.href} title={page.title} />
                      ))}
                    </ul>
                    {pages.length > SHOWN && (
                      <details className="group">
                        <summary className="mt-1 flex cursor-pointer list-none items-center gap-1 px-2 text-sm font-medium text-accent [&::-webkit-details-marker]:hidden">
                          <span className="group-open:hidden">
                            <T k="seeAllArticles" vars={{ n: pages.length }} />
                          </span>
                          <span className="hidden group-open:inline">
                            <T k="showLess" />
                          </span>
                          <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
                        </summary>
                        <ul className="mt-1 space-y-0.5">
                          {pages.slice(SHOWN).map((page) => (
                            <ArticleRow key={page.href} href={page.href} title={page.title} />
                          ))}
                        </ul>
                      </details>
                    )}
                  </article>
                ))}
              </div>
            </section>
          );
        })}

        {top.length > 0 && (
          <section className="rounded-2xl border border-line bg-surface/60 p-6 sm:p-8">
            <h2 className="text-lg font-semibold text-fg">
              <T k="popular" />
            </h2>
            <ul className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-x-10 sm:grid-cols-2">
              {top.map((href) => {
                const item = titles.get(href)!;
                return (
                  <li key={href} className="border-b border-line">
                    <Link href={href} prefetch={true} className="group flex items-center gap-3 py-3">
                      <FileText className="size-4 shrink-0 text-fg-subtle group-hover:text-accent" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-fg group-hover:text-accent">{item.title}</span>
                        <span className="block truncate text-xs text-fg-subtle">{item.category}</span>
                      </span>
                      <ArrowRight className="size-4 shrink-0 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <HelpCta site={site} />
      </main>
    </>
  );
}

function ArticleRow({ href, title, active = false }: { href: string; title: string; active?: boolean }) {
  return (
    <li>
      <Link
        href={href}
        prefetch={true}
        aria-current={active ? "page" : undefined}
        className={`flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors ${
          active ? "bg-accent-soft font-medium text-accent" : "text-fg-muted hover:bg-fill hover:text-fg"
        }`}
      >
        <FileText className={`mt-0.5 size-4 shrink-0 ${active ? "text-accent" : "text-fg-subtle"}`} />
        <span className="min-w-0">{title}</span>
      </Link>
    </li>
  );
}

function HelpCta({ site }: { site: SiteSettings }) {
  return (
    <section className="mt-12 flex flex-col items-start gap-4 rounded-2xl border border-line bg-surface p-6 sm:flex-row sm:items-center sm:p-8">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
        <LifeBuoy className="size-6" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-semibold text-fg">
          <T k="notFoundTitle" />
        </h2>
        <p className="mt-1 text-sm text-fg-muted">
          <T k="notFoundText" />
        </p>
      </div>
      {site.headerCta ? (
        <Link href={site.headerCta.href} className="inline-flex h-10 items-center rounded-lg bg-accent px-4 text-sm font-medium text-white hover:opacity-90">
          {site.headerCta.title}
        </Link>
      ) : (
        <SearchField label={<T k="searchAgain" />} className="h-10! w-auto! min-w-48" />
      )}
    </section>
  );
}

/** Help-centre article: category list at the side, the article on a card, related articles below. */
export function HelpCenterArticle({
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
  const related = place ? place.pages.filter((p) => p.href !== article.href).slice(0, 6) : [];

  return (
    <>
      <div className="border-b border-line bg-surface/60">
        <div className="mx-auto max-w-7xl px-5 py-3 sm:px-8">
          <Breadcrumb place={place} root={<T k="helpCenter" />} />
        </div>
      </div>
      <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)] gap-8 px-5 pt-8 pb-20 sm:px-8 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_13rem]">
        <aside className="hidden lg:block">
          {place && (
            <div className="sticky top-[calc(var(--header-h)+2rem)] max-h-[calc(100vh-var(--header-h)-3rem)] overflow-y-auto">
              <div className="mb-3 flex items-center gap-3 px-2">
                <CategoryBadge title={place.section.title} image={place.section.image} size="sm" />
                <span className="text-sm font-semibold text-fg">{place.section.title}</span>
              </div>
              <ul className="space-y-0.5">
                {place.pages.map((page) => (
                  <ArticleRow key={page.href} href={page.href} title={page.title} active={page.href === article.href} />
                ))}
              </ul>
            </div>
          )}
        </aside>

        <div className="min-w-0">
          {banner}
          <article className="rounded-2xl border border-line bg-surface px-5 py-8 sm:px-10 sm:py-10">
            <header className="mb-8 border-b border-line pb-6">
              <h1 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">{article.title}</h1>
              {article.description && <p className="mt-3 text-lg leading-relaxed text-fg-muted">{article.description}</p>}
              <AuthorByline author={article.author} className="mt-5" />
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-xs text-fg-subtle">
                  <Clock className="size-3.5" />
                  {article.publishedAt && (
                    <>
                      <T k="updated" /> <LocalDate value={article.publishedAt} /> ·{" "}
                    </>
                  )}
                  <T k="minRead" vars={{ n: article.readingMinutes }} />
                </span>
                <CopyPageButton markdown={markdownOf(article)} />
              </div>
            </header>
            <InlineToc doc={article.doc} className="xl:hidden" />
            <div className="prose-docs">
              <RenderDoc doc={article.doc} />
            </div>
            {footer}
          </article>

          {related.length > 0 && place && (
            <section className="mt-10">
              <h2 className="mb-4 text-lg font-semibold text-fg">
                <T k="related" />
              </h2>
              <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
                {related.map((page) => (
                  <li key={page.href}>
                    <Link
                      href={page.href}
                      prefetch={true}
                      className="group flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 transition-colors hover:border-accent/50"
                    >
                      <FileText className="size-4 shrink-0 text-fg-subtle group-hover:text-accent" />
                      <span className="min-w-0 flex-1 truncate text-sm text-fg group-hover:text-accent">{page.title}</span>
                      <ArrowRight className="size-4 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <SideToc doc={article.doc} />
      </div>
      <SiteFooter />
    </>
  );
}
