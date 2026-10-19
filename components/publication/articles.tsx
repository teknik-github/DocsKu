import type { JSONContent } from "@tiptap/core";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ChevronRight } from "lucide-react";
import { tocHeadings } from "@/lib/content/doc";
import { toMarkdown } from "@/lib/content/markdown";
import { RenderDoc } from "@/lib/content/render";
import { allPages, getPager, locate, topicSlug } from "@/lib/navigation";
import type { NavTab, PageCard } from "@/lib/site-types";
import { CopyPageButton } from "@/components/copy-page-button";
import { SiteFooter } from "@/components/site-footer";
import { CoverArt, Meta, PageCardView } from "@/components/publication/cards";
import { SectionMenu } from "@/components/publication/section-menu";

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
};

const markdownOf = (a: ArticleData) => `# ${a.title}\n\n${a.description ? `${a.description}\n\n` : ""}${toMarkdown(a.doc)}`;

/** Collapsible table of contents for layouts without a side column. */
function InlineToc({ doc }: { doc: JSONContent }) {
  const headings = tocHeadings(doc);
  if (headings.length < 3) return null;
  return (
    <details className="group mb-10 rounded-xl border border-line bg-surface px-4 py-3 text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-fg [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 text-fg-subtle transition-transform group-open:rotate-90" />
        Isi halaman
        <span className="font-normal text-fg-subtle">· {headings.length} bagian</span>
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

function cardsFor(hrefs: string[], cards: Map<string, PageCard>) {
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
}: {
  article: ArticleData;
  tabs: NavTab[];
  cards: Map<string, PageCard>;
  banner?: React.ReactNode;
}) {
  const place = locate(tabs, article.href);
  const { prev, next } = getPager(tabs, article.href);
  const related = place ? cardsFor(place.pages.map((p) => p.href).filter((href) => href !== article.href), cards).slice(0, 3) : [];

  return (
    <>
      <div className="mx-auto max-w-6xl px-5 pt-8 pb-20 sm:px-8">
        <div className="mb-12 flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="Breadcrumb" className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm text-fg-subtle">
            <Link href="/docs" className="hover:text-fg">
              Dokumentasi
            </Link>
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

        <article className="mx-auto max-w-3xl">
          {banner}
          <header className="mb-10">
            <h1 className="font-serif text-4xl leading-tight font-light tracking-tight text-fg sm:text-5xl">{article.title}</h1>
            {article.description && <p className="mt-4 text-xl leading-relaxed text-fg-muted">{article.description}</p>}
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
          <InlineToc doc={article.doc} />
          <div className="prose-docs">
            <RenderDoc doc={article.doc} />
          </div>

          {(prev || next) && (
            <nav aria-label="Navigasi halaman" className="mt-16 grid gap-4 sm:grid-cols-2">
              {prev ? (
                <Link href={prev.href} className="group rounded-xl border border-line p-4 transition-colors hover:border-line-strong hover:bg-fill/40">
                  <span className="flex items-center gap-1 text-xs text-fg-subtle">
                    <ArrowLeft className="size-3 transition-transform group-hover:-translate-x-0.5" />
                    Sebelumnya
                  </span>
                  <span className="mt-1 block text-sm font-medium text-fg">{prev.title}</span>
                </Link>
              ) : (
                <span />
              )}
              {next && (
                <Link href={next.href} className="group rounded-xl border border-line p-4 text-right transition-colors hover:border-line-strong hover:bg-fill/40">
                  <span className="flex items-center justify-end gap-1 text-xs text-fg-subtle">
                    Berikutnya
                    <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                  </span>
                  <span className="mt-1 block text-sm font-medium text-fg">{next.title}</span>
                </Link>
              )}
            </nav>
          )}
        </article>

        {related.length > 0 && place && (
          <section className="mt-20 border-t border-line pt-12">
            <h2 className="mb-8 font-serif text-2xl font-light text-fg">Halaman lain di {place.section.title}</h2>
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
}: {
  article: ArticleData;
  tabs: NavTab[];
  cards: Map<string, PageCard>;
  banner?: React.ReactNode;
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
            <Link href={`/docs?topik=${topicSlug(place.tab.title)}`} className="text-xs font-semibold tracking-wide text-accent uppercase hover:underline">
              {place.section.title}
            </Link>
          )}
          <h1 className="mt-3 font-serif text-4xl leading-tight font-light tracking-tight text-fg sm:text-6xl">{article.title}</h1>
          {article.description && <p className="mx-auto mt-5 max-w-2xl text-xl leading-relaxed text-fg-muted">{article.description}</p>}
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
        <div className="prose-docs prose-reading mx-auto mt-14 max-w-[44rem] px-5 sm:px-8">
          <RenderDoc doc={article.doc} />
        </div>
      </article>

      {more.length > 0 && (
        <section className="border-t border-line bg-surface/50">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
            <h2 className="mb-10 text-center font-serif text-3xl font-light text-fg">Tulisan lain</h2>
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
