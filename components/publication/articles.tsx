import type { JSONContent } from "@tiptap/core";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ChevronRight } from "lucide-react";
import { tocHeadings } from "@/lib/content/doc";
import { toMarkdown } from "@/lib/content/markdown";
import { RenderDoc } from "@/lib/content/render";
import { allPages, getPager, locate, topicSlug } from "@/lib/navigation";
import type { NavTab, PageCard } from "@/lib/site-types";
import type { PublicAuthor } from "@/lib/authors";
import { CopyPageButton } from "@/components/copy-page-button";
import { SiteFooter } from "@/components/site-footer";
import { CoverArt, Meta, PageCardView } from "@/components/publication/cards";
import { SectionMenu } from "@/components/publication/section-menu";
import { TableOfContents } from "@/components/toc";
import { HubLink, T } from "@/components/locale-text";
import { AuthorByline } from "@/components/author";

export type ArticleData = {
  href: string;
  title: string;
  description: string;
  doc: JSONContent;
  cover: string | null;
  /** Generated wide cover for pages without one (Ghost layout), if turned on. */
  autoCover?: string | null;
  publishedAt: string | null;
  readingMinutes: number;
  /** Shown as the byline (and, by the route, the author box); null when unknown or turned off. */
  author?: PublicAuthor | null;
};

export const markdownOf = (a: ArticleData) => `# ${a.title}\n\n${a.description ? `${a.description}\n\n` : ""}${toMarkdown(a.doc)}`;

/** Collapsible table of contents above the article, for screens too narrow for the side column. */
export function InlineToc({ doc, className = "" }: { doc: JSONContent; className?: string }) {
  const headings = tocHeadings(doc);
  if (headings.length < 3) return null;
  return (
    <details className={`group mb-10 rounded-xl border border-line bg-surface px-4 py-3 text-sm ${className}`}>
      <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-fg [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 text-fg-subtle transition-transform group-open:rotate-90" />
        <T k="contentsOfPage" />
        <span className="font-normal text-fg-subtle">
          · <T k="nSections" vars={{ n: headings.length }} />
        </span>
      </summary>
      <ul className="mt-3 space-y-1.5 border-l border-line">
        {headings.map((h) => (
          <li key={h.id}>
            <a href={`#${h.id}`} className={`-ml-px block border-l border-transparent text-fg-muted hover:border-accent hover:text-fg ${h.level === 3 ? "pl-6" : "pl-3"}`}>
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * "Di halaman ini" in the right margin on wide screens (xl), sticky and following the
 * scroll. Sits in column 3 of a `[1fr article 1fr]` grid so the article stays centred.
 */
export function SideToc({ doc }: { doc: JSONContent }) {
  return (
    <aside className="hidden xl:col-start-3 xl:row-start-1 xl:block">
      <div className="sticky top-[calc(var(--header-h)+3rem)] max-h-[calc(100vh-var(--header-h)-4rem)] overflow-y-auto pb-4">
        <TableOfContents headings={tocHeadings(doc)} />
      </div>
    </aside>
  );
}

export function cardsFor(hrefs: string[], cards: Map<string, PageCard>) {
  return hrefs.flatMap((href) => {
    const card = cards.get(href);
    return card ? [card] : [];
  });
}

/** Hybrid layout: centred article with breadcrumb, section menu, prev/next and related pages. */
export function HybridArticle({
  article,
  tabs,
  cards,
  banner,
  footer,
}: {
  article: ArticleData;
  tabs: NavTab[];
  cards: Map<string, PageCard>;
  banner?: React.ReactNode;
  /** Shown after the content on the public site (reader feedback); left out in previews. */
  footer?: React.ReactNode;
}) {
  const place = locate(tabs, article.href);
  const { prev, next } = getPager(tabs, article.href);
  const related = place ? cardsFor(place.pages.map((p) => p.href).filter((href) => href !== article.href), cards).slice(0, 3) : [];

  return (
    <>
      <div className="mx-auto max-w-6xl px-5 pt-8 pb-20 sm:px-8">
        <div className="mb-12 flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="Breadcrumb" className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm text-fg-subtle">
            <HubLink className="hover:text-fg">
              <T k="docs" />
            </HubLink>
            {place && (
              <>
                <ChevronRight className="size-3.5" />
                <Link href={place.tab.href} className="hover:text-fg">
                  {place.tab.title}
                </Link>
                <ChevronRight className="size-3.5" />
                <span className="text-fg-muted">{place.section.title}</span>
              </>
            )}
          </nav>
          {place && <SectionMenu section={place.section.title} pages={place.pages} current={article.href} />}
        </div>

        <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(0,48rem)_minmax(0,1fr)] xl:gap-10">
          <article className="mx-auto max-w-3xl min-w-0 xl:col-start-2 xl:row-start-1 xl:mx-0 xl:max-w-none">
            {banner}
            <header className="mb-10">
              <h1 className="font-serif text-4xl leading-tight font-light tracking-tight text-fg sm:text-5xl">{article.title}</h1>
              {article.description && <p className="mt-4 text-xl leading-relaxed text-fg-muted">{article.description}</p>}
              <AuthorByline author={article.author} className="mt-6" />
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-y border-line py-3">
                <Meta card={article} />
                <CopyPageButton markdown={markdownOf(article)} />
              </div>
            </header>
            {article.cover && (
              <div className="mb-10 aspect-[2/1] overflow-hidden rounded-2xl border border-line">
                <CoverArt src={article.cover} title={article.title} />
              </div>
            )}
            <InlineToc doc={article.doc} className="xl:hidden" />
            <div className="prose-docs">
              <RenderDoc doc={article.doc} />
            </div>
            {footer}

            {(prev || next) && (
              <nav aria-label="Navigasi halaman" className="mt-16 grid gap-4 sm:grid-cols-2">
                {prev ? (
                  <Link href={prev.href} className="group rounded-xl border border-line p-4 transition-colors hover:border-line-strong hover:bg-fill/40">
                    <span className="flex items-center gap-1 text-xs text-fg-subtle">
                      <ArrowLeft className="size-3 transition-transform group-hover:-translate-x-0.5" />
                      <T k="prev" />
                    </span>
                    <span className="mt-1 block text-sm font-medium text-fg">{prev.title}</span>
                  </Link>
                ) : (
                  <span />
                )}
                {next && (
                  <Link href={next.href} className="group rounded-xl border border-line p-4 text-right transition-colors hover:border-line-strong hover:bg-fill/40">
                    <span className="flex items-center justify-end gap-1 text-xs text-fg-subtle">
                      <T k="next" />
                      <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                    </span>
                    <span className="mt-1 block text-sm font-medium text-fg">{next.title}</span>
                  </Link>
                )}
              </nav>
            )}
          </article>
          <SideToc doc={article.doc} />
        </div>

        {related.length > 0 && place && (
          <section className="mt-20 border-t border-line pt-12">
            <h2 className="mb-8 font-serif text-2xl font-light text-fg">
              <T k="otherPagesIn" vars={{ section: place.section.title }} />
            </h2>
            <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((card) => (
                <PageCardView key={card.href} card={card} tag={place.section.title} />
              ))}
            </div>
          </section>
        )}
      </div>
      <SiteFooter />
    </>
  );
}

/** Ghost layout: blog-style post with a wide cover, a narrow reading column, and more posts below. */
export function GhostArticle({
  article,
  tabs,
  cards,
  banner,
  footer,
}: {
  article: ArticleData;
  tabs: NavTab[];
  cards: Map<string, PageCard>;
  banner?: React.ReactNode;
  /** Shown after the content on the public site (reader feedback); left out in previews. */
  footer?: React.ReactNode;
}) {
  const place = locate(tabs, article.href);
  const pages = allPages(tabs);
  // More from the same topic first, then featured, then the rest.
  const more = pages
    .filter((p) => p.href !== article.href)
    .map((p) => ({ page: p, card: cards.get(p.href) }))
    .filter((x): x is { page: (typeof pages)[number]; card: PageCard } => Boolean(x.card))
    .sort((a, b) => Number(b.page.tab === place?.tab.title) - Number(a.page.tab === place?.tab.title) || Number(b.card.featured) - Number(a.card.featured))
    .slice(0, 3);

  return (
    <>
      <article className="pb-20">
        <header className="mx-auto max-w-3xl px-5 pt-14 text-center sm:px-8 lg:pt-20">
          {banner}
          {place && (
            <HubLink suffix={`?topik=${topicSlug(place.tab.title)}`} className="text-xs font-semibold tracking-wide text-accent uppercase hover:underline">
              {place.section.title}
            </HubLink>
          )}
          <h1 className="mt-3 font-serif text-4xl leading-tight font-light tracking-tight text-fg sm:text-6xl">{article.title}</h1>
          {article.description && <p className="mx-auto mt-5 max-w-2xl text-xl leading-relaxed text-fg-muted">{article.description}</p>}
          <AuthorByline author={article.author} align="center" className="mt-6" />
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Meta card={article} />
            <CopyPageButton markdown={markdownOf(article)} />
          </div>
        </header>
        <div className="mx-auto mt-12 max-w-5xl px-5 sm:px-8">
          <div className="aspect-[2.2/1] overflow-hidden rounded-2xl border border-line">
            <CoverArt src={article.cover ?? article.autoCover ?? null} title={article.title} />
          </div>
        </div>
        <div className="mx-auto mt-14 max-w-6xl px-5 sm:px-8 xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(0,44rem)_minmax(0,1fr)] xl:gap-10">
          <div className="mx-auto max-w-[44rem] min-w-0 xl:col-start-2 xl:row-start-1 xl:mx-0 xl:max-w-none">
            <InlineToc doc={article.doc} className="xl:hidden" />
            <div className="prose-docs prose-reading">
              <RenderDoc doc={article.doc} />
            </div>
            {footer}
          </div>
          <SideToc doc={article.doc} />
        </div>
      </article>

      {more.length > 0 && (
        <section className="border-t border-line bg-surface/50">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
            <h2 className="mb-10 text-center font-serif text-3xl font-light text-fg">
              <T k="otherPosts" />
            </h2>
            <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {more.map(({ page, card }) => (
                <PageCardView key={card.href} card={card} tag={page.section} showFeatured />
              ))}
            </div>
          </div>
        </section>
      )}
      <SiteFooter />
    </>
  );
}
