import Link from "next/link";
import { getPager, locate } from "@/lib/navigation";
import type { NavTab, PageCard, SiteSettings } from "@/lib/site-types";
import { RenderDoc } from "@/lib/content/render";
import { CopyPageButton } from "@/components/copy-page-button";
import { SearchField } from "@/components/search";
import { SiteFooter } from "@/components/site-footer";
import { type ArticleData, InlineToc, markdownOf } from "@/components/publication/articles";
import { Meta } from "@/components/publication/cards";
import { categoriesOf } from "@/components/publication/parts";
import { HubLink, T } from "@/components/locale-text";
import { AuthorByline } from "@/components/author";

/** "Minimal": one narrow column, no sidebar, nothing but text. */

export function MinimalHub({ site, tabs, cards }: { site: SiteSettings; tabs: NavTab[]; cards: Map<string, PageCard> }) {
  const categories = categoriesOf(tabs);
  return (
    <main className="mx-auto max-w-2xl px-5 pt-16 pb-24 sm:px-8 lg:pt-20">
      <h1 className="text-3xl font-semibold tracking-tight text-fg">{site.name}</h1>
      {site.description && <p className="mt-2 text-fg-muted">{site.description}</p>}
      <SearchField className="mt-8" />

      {categories.length === 0 && (
        <p className="mt-12 text-sm text-fg-muted">
          <T k="noPages" />
        </p>
      )}

      {tabs.map((tab) => {
        const inTab = categories.filter((c) => c.tab === tab);
        if (!inTab.length) return null;
        return (
          <section key={tab.title} className="mt-14">
            {tabs.length > 1 && <h2 className="mb-6 text-xs font-semibold tracking-[0.2em] text-fg-subtle uppercase">{tab.title}</h2>}
            {inTab.map(({ section, pages }) => (
              <div key={section.title} className="mt-8 first:mt-0">
                <h3 className="text-sm font-medium text-fg">{section.title}</h3>
                <ul className="mt-2">
                  {pages.map((page) => {
                    const description = cards.get(page.href)?.description;
                    return (
                      <li key={page.href}>
                        <Link href={page.href} prefetch={true} className="group block border-l border-line py-1.5 pl-4 transition-colors hover:border-accent">
                          <span className="text-[15px] text-fg-muted group-hover:text-fg">{page.title}</span>
                          {description && <span className="block truncate text-sm text-fg-subtle">{description}</span>}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>
        );
      })}
    </main>
  );
}

export function MinimalArticle({
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
  const { prev, next } = getPager(tabs, article.href);

  return (
    <>
      <article className="mx-auto max-w-2xl px-5 pt-10 pb-20 sm:px-8 lg:pt-14">
        {banner}
        {place && (
          // The section's pages as a row of pills: the navigation for a layout without a sidebar.
          <nav aria-label={place.section.title} className="-mx-5 mb-10 overflow-x-auto px-5 sm:mx-0 sm:px-0">
            <p className="mb-2 text-xs text-fg-subtle">
              <HubLink className="hover:text-fg">{place.tab.title}</HubLink>{" "}
              / {place.section.title}
            </p>
            <ul className="flex gap-1.5 pb-1 sm:flex-wrap">
              {place.pages.map((page) => {
                const active = page.href === article.href;
                return (
                  <li key={page.href} className="shrink-0">
                    <Link
                      href={page.href}
                      prefetch={true}
                      aria-current={active ? "page" : undefined}
                      className={`inline-flex h-7 items-center rounded-full px-3 text-xs whitespace-nowrap transition-colors ${
                        active ? "bg-fg text-page" : "border border-line text-fg-muted hover:border-line-strong hover:text-fg"
                      }`}
                    >
                      {page.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}

        <header className="mb-10">
          <h1 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">{article.title}</h1>
          {article.description && <p className="mt-3 text-lg text-fg-muted">{article.description}</p>}
          <AuthorByline author={article.author} className="mt-4" />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Meta card={article} />
            <CopyPageButton markdown={markdownOf(article)} />
          </div>
        </header>
        <InlineToc doc={article.doc} />
        <div className="prose-docs prose-reading">
          <RenderDoc doc={article.doc} />
        </div>
        {footer}

        {(prev || next) && (
          <nav aria-label="Navigasi halaman" className="mt-16 flex flex-col gap-3 border-t border-line pt-6 text-sm sm:flex-row sm:justify-between">
            {prev ? (
              <Link href={prev.href} prefetch={true} className="text-fg-muted hover:text-fg">
                ←{" "}
                <span className="text-fg-subtle">
                  <T k="prev" />:
                </span>{" "}
                {prev.title}
              </Link>
            ) : (
              <span />
            )}
            {next && (
              <Link href={next.href} prefetch={true} className="text-fg-muted hover:text-fg sm:text-right">
                <span className="text-fg-subtle">
                  <T k="next" />:
                </span>{" "}
                {next.title} →
              </Link>
            )}
          </nav>
        )}
      </article>
      <SiteFooter />
    </>
  );
}
