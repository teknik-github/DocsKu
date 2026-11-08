import { getPageCards, getPopularPages } from "@/lib/data/site";
import type { DocsLayout } from "@/lib/docs-layouts";
import type { NavTab, SiteSettings } from "@/lib/site-types";
import { type ArticleData, GhostArticle, HybridArticle } from "@/components/publication/articles";
import { BookArticle, BookHub } from "@/components/publication/book";
import { DeveloperArticle, DeveloperHub } from "@/components/publication/developer";
import { HelpCenterArticle, HelpCenterHub } from "@/components/publication/helpcenter";
import { GhostHub, HybridHub } from "@/components/publication/hubs";
import { MagazineArticle, MagazineHub } from "@/components/publication/magazine";
import { MinimalArticle, MinimalHub } from "@/components/publication/minimal";
import { WikiArticle, WikiHub } from "@/components/publication/wiki";

/**
 * The hub (/docs) and article views of every layout except "docs", which keeps
 * its sidebar from app/(site)/docs/layout.tsx and DocArticle. Callers:
 * docs/page.tsx, docs/[...slug]/page.tsx and preview/[id]/page.tsx.
 * Articles render their own SiteFooter; hubs don't.
 */
type PublicationLayout = Exclude<DocsLayout, "docs">;

const cardMap = async (locale?: string) => new Map((await getPageCards(locale)).map((card) => [card.href, card]));

export async function PublicationHub({ layout, site, tabs, locale }: { layout: PublicationLayout; site: SiteSettings; tabs: NavTab[]; locale?: string }) {
  const cards = await cardMap(locale);
  switch (layout) {
    case "ghost":
      return <GhostHub site={site} tabs={tabs} cards={cards} />;
    case "helpcenter":
      return <HelpCenterHub site={site} tabs={tabs} cards={cards} popular={await getPopularPages(6, locale)} />;
    case "book":
      return <BookHub site={site} tabs={tabs} />;
    case "minimal":
      return <MinimalHub site={site} tabs={tabs} cards={cards} />;
    case "wiki":
      return <WikiHub tabs={tabs} cards={cards} />;
    case "magazine":
      return <MagazineHub site={site} tabs={tabs} cards={cards} popular={await getPopularPages(5, locale)} />;
    case "developer":
      return <DeveloperHub site={site} tabs={tabs} cards={cards} />;
    default:
      return <HybridHub tabs={tabs} cards={cards} />;
  }
}

export async function PublicationArticle({
  layout,
  article,
  tabs,
  banner,
  footer,
  locale,
}: {
  layout: PublicationLayout;
  /** The article's language (an extra one), for the cards and popular lists it shows. */
  locale?: string;
  article: ArticleData;
  tabs: NavTab[];
  banner?: React.ReactNode;
  /** Reader feedback and comments on the public site; left out in previews. */
  footer?: React.ReactNode;
}) {
  const view = { article, tabs, banner, footer };
  switch (layout) {
    case "ghost":
      return <GhostArticle {...view} cards={await cardMap(locale)} />;
    case "helpcenter":
      return <HelpCenterArticle {...view} />;
    case "book":
      return <BookArticle {...view} />;
    case "minimal":
      return <MinimalArticle {...view} />;
    case "wiki":
      return <WikiArticle {...view} />;
    case "magazine":
      return <MagazineArticle {...view} cards={await cardMap(locale)} popular={await getPopularPages(6, locale)} />;
    case "developer":
      return <DeveloperArticle {...view} />;
    default:
      return <HybridArticle {...view} cards={await cardMap(locale)} />;
  }
}
