import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { allPages, locate, topicSlug } from "@/lib/navigation";
import type { NavTab, PageCard, SiteSettings } from "@/lib/site-types";
import { RenderDoc } from "@/lib/content/render";
import { tocHeadings } from "@/lib/content/doc";
import { CopyPageButton } from "@/components/copy-page-button";
import { SiteFooter } from "@/components/site-footer";
import { TableOfContents } from "@/components/toc";
import { type ArticleData, InlineToc, markdownOf } from "@/components/publication/articles";
import { CoverArt, Meta } from "@/components/publication/cards";
import { popularFirst } from "@/components/publication/parts";
import { HubLink, T } from "@/components/locale-text";
import { AuthorByline } from "@/components/author";

/** "Majalah": an editorial front page and long-read articles. */

type Story = { card: PageCard; section: string; tab: string };

function storiesOf(tabs: NavTab[], cards: Map<string, PageCard>): Story[] {
  return allPages(tabs).flatMap((page) => {
    const card = cards.get(page.href);
    return card ? [{ card, section: page.section, tab: page.tab }] : [];
  });
}

function Kicker({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] font-bold tracking-[0.18em] text-accent uppercase">{children}</span>;
}

/** Numbered "Terpopuler" list. */
function MostRead({ stories, title = <T k="mostRead" /> }: { stories: Story[]; title?: React.ReactNode }) {
  if (!stories.length) return null;
  return (
    <section>
      <h2 className="border-b-2 border-fg pb-2 text-xs font-bold tracking-[0.18em] text-fg uppercase">{title}</h2>
      <ol>
        {stories.map((story, i) => (
          <li key={story.card.href} className="border-b border-line">
            <Link href={story.card.href} prefetch={true} className="group flex gap-4 py-3.5">
              <span className="w-6 shrink-0 font-serif text-3xl leading-none font-light text-accent/70 tabular-nums">{i + 1}</span>
              <span className="min-w-0">
                <Kicker>{story.section}</Kicker>
                <span className="mt-0.5 block font-serif text-[17px] leading-snug text-fg group-hover:underline">{story.card.title}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function MagazineHub({
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
  const stories = storiesOf(tabs, cards);
  const lead = stories.find((s) => s.card.featured) ?? stories[0];
  const second = stories.filter((s) => s !== lead && s.card.featured).concat(stories.filter((s) => s !== lead && !s.card.featured)).slice(0, 2);
  const byHref = new Map(stories.map((s) => [s.card.href, s]));
  const most = popularFirst(popular, stories.map((s) => s.card.href), 5).flatMap((href) => (byHref.get(href) ? [byHref.get(href)!] : []));

  return (
    <main className="mx-auto max-w-7xl px-5 pt-10 pb-24 sm:px-8">
      <header className="border-y-2 border-fg py-6 text-center">
        <h1 className="font-serif text-5xl font-light tracking-tight text-fg sm:text-7xl">{site.name}</h1>
        {site.description && <p className="mt-2 text-sm text-fg-muted">{site.description}</p>}
        {tabs.length > 1 && (
          <nav aria-label="Topik" className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs font-semibold tracking-[0.15em] text-fg-muted uppercase">
            {tabs.map((tab) => (
              <a key={tab.title} href={`#${topicSlug(tab.title)}`} className="hover:text-accent">
                {tab.title}
              </a>
            ))}
          </nav>
        )}
      </header>

      {!lead && (
        <p className="mt-12 text-center text-sm text-fg-muted">
          <T k="noStories" />
        </p>
      )}

      {lead && (
        <div className="mt-10 grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0">
            <Link href={lead.card.href} prefetch={true} className="group block">
              <div className="aspect-[16/9] overflow-hidden bg-fill">
                <CoverArt src={lead.card.cover} title={lead.card.title} sizes="(min-width: 1024px) 60vw, 100vw" priority className="transition-transform duration-500 group-hover:scale-[1.02]" />
              </div>
              <div className="mt-5">
                <Kicker>{lead.section}</Kicker>
                <h2 className="mt-2 font-serif text-3xl leading-tight font-light text-fg group-hover:underline sm:text-5xl">{lead.card.title}</h2>
                {lead.card.description && <p className="mt-3 max-w-2xl text-lg leading-relaxed text-fg-muted">{lead.card.description}</p>}
                <span className="mt-3 block">
                  <Meta card={lead.card} />
                </span>
              </div>
            </Link>
            {second.length > 0 && (
              <div className="mt-10 grid grid-cols-[minmax(0,1fr)] gap-8 border-t border-line pt-8 sm:grid-cols-2">
                {second.map((story) => (
                  <Link key={story.card.href} href={story.card.href} prefetch={true} className="group flex gap-4">
                    <div className="aspect-square w-24 shrink-0 overflow-hidden bg-fill">
                      <CoverArt src={story.card.cover} title={story.card.title} />
                    </div>
                    <div className="min-w-0">
                      <Kicker>{story.section}</Kicker>
                      <h3 className="mt-1 font-serif text-xl leading-snug text-fg group-hover:underline">{story.card.title}</h3>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
          <aside className="lg:border-l lg:border-line lg:pl-8">
            <MostRead stories={most} />
          </aside>
        </div>
      )}

      {tabs.map((tab) => {
        const shelf = stories.filter((s) => s.tab === tab.title);
        if (!shelf.length) return null;
        return (
          <section key={tab.title} id={topicSlug(tab.title)} className="mt-16 scroll-mt-24">
            <div className="flex items-center gap-4">
              <h2 className="shrink-0 font-serif text-3xl font-light text-fg">{tab.title}</h2>
              <span className="h-px flex-1 bg-line-strong" />
              <span className="shrink-0 text-xs text-fg-subtle">{shelf.length} tulisan</span>
            </div>
            <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
              {shelf.slice(0, 8).map((story, i) => (
                <Link
                  key={story.card.href}
                  href={story.card.href}
                  prefetch={true}
                  className={`group block ${i === 0 ? "sm:col-span-2 lg:row-span-2" : ""}`}
                >
                  <div className={`overflow-hidden bg-fill ${i === 0 ? "aspect-[4/3]" : "aspect-[3/2]"}`}>
                    <CoverArt src={story.card.cover} title={story.card.title} className="transition-transform duration-500 group-hover:scale-[1.03]" />
                  </div>
                  <div className="mt-3">
                    <Kicker>{story.section}</Kicker>
                    <h3 className={`mt-1 font-serif leading-snug text-fg group-hover:underline ${i === 0 ? "text-2xl sm:text-3xl" : "text-lg"}`}>{story.card.title}</h3>
                    {i === 0 && story.card.description && <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-fg-muted">{story.card.description}</p>}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </main>
  );
}

export function MagazineArticle({
  article,
  tabs,
  cards,
  popular,
  banner,
  footer,
}: {
  article: ArticleData;
  tabs: NavTab[];
  cards: Map<string, PageCard>;
  popular: string[];
  banner?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const place = locate(tabs, article.href);
  const stories = storiesOf(tabs, cards).filter((s) => s.card.href !== article.href);
  const byHref = new Map(stories.map((s) => [s.card.href, s]));
  const most = popularFirst(popular, stories.map((s) => s.card.href), 5).flatMap((href) => (byHref.get(href) ? [byHref.get(href)!] : []));
  const more = stories
    .filter((s) => !most.slice(0, 3).includes(s))
    .sort((a, b) => Number(b.tab === place?.tab.title) - Number(a.tab === place?.tab.title))
    .slice(0, 4);
  const cover = article.cover ?? article.autoCover ?? null;

  return (
    <>
      <article className="mx-auto max-w-7xl px-5 pt-10 pb-16 sm:px-8 lg:pt-14">
        {banner}
        <header className="max-w-4xl">
          {place && (
            <HubLink suffix={`#${topicSlug(place.tab.title)}`} className="hover:underline">
              <Kicker>{place.section.title}</Kicker>
            </HubLink>
          )}
          <h1 className="mt-3 font-serif text-4xl leading-[1.08] font-light tracking-tight text-fg sm:text-6xl">{article.title}</h1>
          {article.description && <p className="mt-5 max-w-3xl font-serif text-xl leading-relaxed text-fg-muted sm:text-2xl">{article.description}</p>}
          <AuthorByline author={article.author} className="mt-6" />
          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <Meta card={article} />
            <CopyPageButton markdown={markdownOf(article)} />
          </div>
        </header>
        {cover && (
          <figure className="mt-10 aspect-[2.2/1] overflow-hidden bg-fill">
            <CoverArt src={cover} title={article.title} sizes="100vw" priority />
          </figure>
        )}

        <div className="mt-12 grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[minmax(0,42rem)_minmax(0,1fr)] xl:gap-20">
          <div className="min-w-0">
            <InlineToc doc={article.doc} className="lg:hidden" />
            <div className="prose-docs prose-reading prose-magazine">
              <RenderDoc doc={article.doc} />
            </div>
            {footer}
          </div>
          <aside className="hidden lg:block">
            <div className="sticky top-[calc(var(--header-h)+2rem)] max-h-[calc(100vh-var(--header-h)-3rem)] space-y-10 overflow-y-auto pb-4">
              <TableOfContents headings={tocHeadings(article.doc)} />
              <MostRead stories={most} />
            </div>
          </aside>
        </div>
      </article>

      {more.length > 0 && (
        <section className="border-t-2 border-fg">
          <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
            <h2 className="flex items-center gap-2 text-xs font-bold tracking-[0.18em] text-fg uppercase">
              <T k="alsoRead" />
              <ArrowRight className="size-3.5" />
            </h2>
            <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
              {more.map((story) => (
                <Link key={story.card.href} href={story.card.href} prefetch={true} className="group block">
                  <div className="aspect-[3/2] overflow-hidden bg-fill">
                    <CoverArt src={story.card.cover} title={story.card.title} />
                  </div>
                  <div className="mt-3">
                    <Kicker>{story.section}</Kicker>
                    <h3 className="mt-1 font-serif text-lg leading-snug text-fg group-hover:underline">{story.card.title}</h3>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
      <SiteFooter />
    </>
  );
}
