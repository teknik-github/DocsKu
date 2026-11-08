import Link from "next/link";
import { ArrowLeft, ArrowRight, BookOpen } from "lucide-react";
import type { NavTab, SiteSettings } from "@/lib/site-types";
import { RenderDoc } from "@/lib/content/render";
import { CopyPageButton } from "@/components/copy-page-button";
import { SiteFooter } from "@/components/site-footer";
import { type ArticleData, InlineToc, markdownOf, SideToc } from "@/components/publication/articles";
import { Meta } from "@/components/publication/cards";
import { type BookEntry, bookOutline, roman } from "@/components/publication/parts";
import { PageTurnKeys, ReadingProgress } from "@/components/publication/reading-progress";
import { HubLink, T } from "@/components/locale-text";
import { AuthorByline } from "@/components/author";

/** "Buku": the docs read like a book, in numbered parts and chapters. */

const number = (e: BookEntry) => `${e.chapter}.${e.index}`;

/** Groups the outline into parts → chapters → pages, keeping order. */
function partsOf(outline: BookEntry[]) {
  const parts: { part: number; title: string; chapters: { chapter: number; title: string; pages: BookEntry[] }[] }[] = [];
  for (const entry of outline) {
    let part = parts.at(-1);
    if (!part || part.part !== entry.part) parts.push((part = { part: entry.part, title: entry.partTitle, chapters: [] }));
    let chapter = part.chapters.at(-1);
    if (!chapter || chapter.chapter !== entry.chapter) part.chapters.push((chapter = { chapter: entry.chapter, title: entry.chapterTitle, pages: [] }));
    chapter.pages.push(entry);
  }
  return parts;
}

export function BookHub({ site, tabs }: { site: SiteSettings; tabs: NavTab[] }) {
  const outline = bookOutline(tabs);
  const parts = partsOf(outline);
  const chapters = parts.reduce((n, p) => n + p.chapters.length, 0);

  return (
    <main className="mx-auto max-w-3xl px-5 pt-16 pb-24 sm:px-8 lg:pt-24">
      <header className="border-b-2 border-fg pb-10 text-center">
        <p className="text-xs font-semibold tracking-[0.25em] text-accent uppercase">
          <T k="guidebook" />
        </p>
        <h1 className="mt-4 font-serif text-5xl font-light tracking-tight text-fg sm:text-6xl">{site.name}</h1>
        {site.description && <p className="mx-auto mt-4 max-w-xl font-serif text-xl text-fg-muted italic">{site.description}</p>}
        <p className="mt-6 text-sm text-fg-subtle">
          <T k="bookStats" vars={{ parts: parts.length, chapters, pages: outline.length }} />
        </p>
        {outline[0] && (
          <Link
            href={outline[0].href}
            prefetch={true}
            className="mt-8 inline-flex h-11 items-center gap-2 rounded-full bg-fg px-6 text-sm font-medium text-page transition-opacity hover:opacity-85"
          >
            <BookOpen className="size-4" />
            <T k="startReading" />
          </Link>
        )}
      </header>

      {outline.length === 0 && (
        <p className="mt-12 text-center text-sm text-fg-muted">
          <T k="noPages" />
        </p>
      )}

      <nav aria-label="Daftar isi" className="mt-14">
        <h2 className="mb-10 text-center font-serif text-2xl font-light text-fg">
          <T k="contents" />
        </h2>
        {parts.map((part) => (
          <section key={part.part} className="mb-14">
            {parts.length > 1 && (
              <h3 className="mb-6 flex items-baseline gap-3 border-b border-line pb-2">
                <span className="font-serif text-sm text-accent">
                  <T k="part" vars={{ n: roman(part.part) }} />
                </span>
                <span className="font-serif text-2xl font-light text-fg">{part.title}</span>
              </h3>
            )}
            <ol className="space-y-8">
              {part.chapters.map((chapter) => (
                <li key={chapter.chapter}>
                  <p className="flex items-baseline gap-3">
                    <span className="w-14 shrink-0 font-serif text-sm text-fg-subtle">
                      <T k="chapter" vars={{ n: chapter.chapter }} />
                    </span>
                    <span className="font-serif text-xl text-fg">{chapter.title}</span>
                  </p>
                  <ol className="mt-2 ml-0 sm:ml-[4.25rem]">
                    {chapter.pages.map((page) => (
                      <li key={page.href}>
                        <Link href={page.href} prefetch={true} className="group flex items-baseline gap-3 py-1.5 text-[15px]">
                          <span className="min-w-0 text-fg-muted group-hover:text-accent">{page.title}</span>
                          <span aria-hidden className="min-w-6 flex-1 -translate-y-1 border-b border-dotted border-line-strong" />
                          <span className="shrink-0 font-mono text-xs text-fg-subtle tabular-nums">{number(page)}</span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </nav>
    </main>
  );
}

export function BookArticle({
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
  const outline = bookOutline(tabs);
  const at = outline.findIndex((e) => e.href === article.href);
  const entry = at >= 0 ? outline[at] : undefined;
  // Prev/next run through the whole book, across chapters and parts.
  const prev = at > 0 ? outline[at - 1] : undefined;
  const next = at >= 0 ? outline[at + 1] : undefined;
  const chapter = entry ? outline.filter((e) => e.chapter === entry.chapter) : [];

  return (
    <>
      <ReadingProgress />
      <PageTurnKeys prev={prev?.href} next={next?.href} />
      <div className="mx-auto max-w-6xl px-5 pt-12 pb-20 sm:px-8 lg:pt-16 xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(0,40rem)_minmax(0,1fr)] xl:gap-12">
        {/* Chapter contents at the left on wide screens. */}
        <aside className="hidden xl:col-start-1 xl:row-start-1 xl:block">
          {entry && (
            <nav aria-label={`Bab ${entry.chapter}`} className="sticky top-[calc(var(--header-h)+3rem)] ml-auto max-w-56 text-right">
              <HubLink className="text-xs text-fg-subtle hover:text-fg">
                ← <T k="contents" />
              </HubLink>
              <p className="mt-4 font-serif text-sm text-accent">
                <T k="chapter" vars={{ n: entry.chapter }} />
              </p>
              <p className="font-serif text-lg leading-snug text-fg">{entry.chapterTitle}</p>
              <ol className="mt-4 space-y-1.5 border-r border-line pr-3 text-sm">
                {chapter.map((page) => (
                  <li key={page.href}>
                    <Link
                      href={page.href}
                      prefetch={true}
                      aria-current={page.href === article.href ? "page" : undefined}
                      className={`-mr-[calc(0.75rem+1px)] block border-r-2 pr-3 ${page.href === article.href ? "border-accent text-fg" : "border-transparent text-fg-muted hover:text-fg"}`}
                    >
                      {page.title} <span className="font-mono text-[11px] text-fg-subtle">{number(page)}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            </nav>
          )}
        </aside>

        <article className="mx-auto max-w-[40rem] min-w-0 xl:col-start-2 xl:row-start-1 xl:mx-0 xl:max-w-none">
          {banner}
          <header className="mb-12 text-center">
            {entry && (
              <p className="font-serif text-sm text-fg-subtle">
                {tabs.length > 1 && (
                  <>
                    <T k="part" vars={{ n: roman(entry.part) }} /> ·{" "}
                  </>
                )}
                <T k="chapterOf" vars={{ n: entry.chapter, title: entry.chapterTitle }} />
              </p>
            )}
            {entry && <p className="mt-6 font-serif text-5xl font-light text-accent tabular-nums">{number(entry)}</p>}
            <h1 className="mt-4 font-serif text-4xl leading-tight font-light tracking-tight text-fg sm:text-5xl">{article.title}</h1>
            {article.description && <p className="mt-5 font-serif text-xl leading-relaxed text-fg-muted italic">{article.description}</p>}
            <AuthorByline author={article.author} align="center" className="mt-6" />
            <div className="mx-auto mt-8 flex max-w-sm flex-wrap items-center justify-center gap-3 border-t border-line pt-4">
              <Meta card={article} />
              <CopyPageButton markdown={markdownOf(article)} />
            </div>
          </header>
          <InlineToc doc={article.doc} className="xl:hidden" />
          <div className="prose-docs prose-reading prose-book">
            <RenderDoc doc={article.doc} />
          </div>
          {footer}

          {(prev || next) && (
            <nav aria-label="Navigasi buku" className="mt-20 border-t border-line pt-10">
              {next && (
                <Link href={next.href} prefetch={true} className="group block rounded-2xl border border-line bg-surface p-6 transition-colors hover:border-accent/60 sm:p-8">
                  <span className="flex items-center justify-between gap-3 text-xs font-medium tracking-wide text-fg-subtle uppercase">
                    {next.chapter !== entry?.chapter ? <T k="nextChapter" vars={{ n: next.chapter }} /> : <T k="nextPage" />}
                    <ArrowRight className="size-4 text-accent transition-transform group-hover:translate-x-1" />
                  </span>
                  <span className="mt-3 flex items-baseline gap-3">
                    <span className="font-mono text-sm text-fg-subtle">{number(next)}</span>
                    <span className="font-serif text-2xl leading-snug text-fg group-hover:text-accent sm:text-3xl">{next.title}</span>
                  </span>
                  {next.chapter !== entry?.chapter && <span className="mt-1 block text-sm text-fg-muted">{next.chapterTitle}</span>}
                </Link>
              )}
              <div className="mt-4 flex items-center justify-between gap-4 text-sm">
                {prev ? (
                  <Link href={prev.href} prefetch={true} className="group flex min-w-0 items-center gap-1.5 text-fg-muted hover:text-fg">
                    <ArrowLeft className="size-3.5 shrink-0 transition-transform group-hover:-translate-x-0.5" />
                    <span className="truncate">
                      {number(prev)} {prev.title}
                    </span>
                  </Link>
                ) : (
                  <span />
                )}
                <span className="hidden shrink-0 text-xs text-fg-subtle sm:inline">
                  <T k="pageTurnHint" />
                </span>
              </div>
            </nav>
          )}
        </article>
        <SideToc doc={article.doc} />
      </div>
      <SiteFooter />
    </>
  );
}
