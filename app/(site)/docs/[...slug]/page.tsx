import { Suspense } from "react";
import type { Metadata } from "next";
import { applyGlossary } from "@/lib/glossary";
import { notFound } from "next/navigation";
import {
  generatedCover,
  getAutomation,
  getCommentSettings,
  getGlossary,
  getLanguageSettings,
  getNavigation,
  getPublishedPage,
  getPublishedSlugs,
  getSiteSettings,
  getTranslationAlternates,
  readingMinutes,
} from "@/lib/data/site";
import { DocsHub } from "@/components/docs-hub";
import { localeFromSlug, t } from "@/lib/i18n";
import { PublicationArticle } from "@/components/publication/registry";
import { findPage, getPager, slugToHref } from "@/lib/navigation";
import { DocArticle, DocSkeleton } from "@/components/doc-article";
import { ReaderFooter } from "@/components/reader-footer";
import { pageMetadata } from "@/lib/seo";
import { getInternalPage } from "@/lib/data/internal";
import { internalSlugExists } from "@/lib/data/existence";
import { getCurrentUser } from "@/lib/auth/dal";
import { InternalBanner } from "@/components/internal-banner";
import { getAuthor } from "@/lib/data/authors";
import { AuthorBox } from "@/components/author";
import { ArchivedDoc, archiveTarget } from "@/components/archived-doc";

/**
 * The page decides "not found" from `params` before anything streams (a real
 * HTTP 404 instead of a 200 with not-found content), so a navigation to a slug
 * that wasn't prerendered waits for that check instead of showing a fallback first.
 */
export const instant = false;

export async function generateStaticParams() {
  const [slugs, languages] = await Promise.all([getPublishedSlugs(), getLanguageSettings()]);
  // Each extra language's hub is /docs/<code>.
  const all = [...slugs, ...languages.languages.map((language) => language.code)];
  // Cache Components needs at least one param; "_" renders the 404 page.
  return all.length ? all.map((slug) => ({ slug: slug.split("/") })) : [{ slug: ["_"] }];
}

/** /docs/<code>: the hub of an extra language, or null. */
async function hubLanguage(slug: string[]) {
  if (slug.length !== 1) return null;
  const languages = await getLanguageSettings();
  return languages.languages.some((language) => language.code === slug[0]) ? slug[0] : null;
}

export async function generateMetadata({
  params,
}: PageProps<"/docs/[...slug]">): Promise<Metadata> {
  const { slug } = await params;
  // /docs/v/<version>/…: archived versions are never indexed.
  const archived = await archiveTarget(slug);
  if (archived) return { title: archived.page ? `${archived.page.title} (${archived.version.label})` : `Dokumentasi ${archived.version.label}`, robots: { index: false, follow: true } };
  const hub = await hubLanguage(slug);
  const [page, automation, alternates, languages] = await Promise.all([
    hub ? null : getPublishedPage(slug.join("/")),
    getAutomation(),
    getTranslationAlternates(),
    getLanguageSettings(),
  ]);
  if (hub) {
    const hubs = Object.fromEntries([[languages.defaultLocale, "/docs"], ...languages.languages.map((l) => [l.code, `/docs/${l.code}`]), ["x-default", "/docs"]]);
    return { title: t(hub, "docs"), alternates: { languages: hubs } };
  }
  // Missing, or an internal article (never described to visitors or crawlers).
  if (!page) return { robots: { index: false, follow: false } };
  const metadata = pageMetadata({ ...page, image: page.coverImage ?? (automation.cover ? generatedCover(page.slug, "og", automation.coverColor) : null) });
  // hreflang: every published version of this page, the original as x-default.
  const versions = alternates[slugToHref(page.slug)];
  if (versions) metadata.alternates = { languages: { ...versions, "x-default": versions[languages.defaultLocale] } };
  return metadata;
}

export default async function DocPage({ params }: PageProps<"/docs/[...slug]">) {
  // Decide "not found" before anything streams, so it is a real HTTP 404. An internal
  // article is a 404 for visitors too, the same response as a slug that doesn't exist.
  const { slug } = await params;
  const path = slug.join("/");
  if (slug[0] === "v" && slug.length >= 2) {
    // An archived version (or its hub); "v/…" is never a page slug.
    const archived = await archiveTarget(slug);
    if (!archived || (slug.length > 2 && !archived.page)) notFound();
    return (
      <Suspense fallback={<DocSkeleton />}>
        <ArchivedDoc slug={slug} />
      </Suspense>
    );
  }
  const [hub, page] = await Promise.all([hubLanguage(slug), getPublishedPage(path)]);
  if (!hub && !page) {
    // Both lookups for every miss, so an internal slug and an unknown one do the same work.
    const [internal, user] = await Promise.all([internalSlugExists(path), getCurrentUser()]);
    if (!internal || !user) notFound();
  }
  return (
    <Suspense fallback={<DocSkeleton />}>
      <DocContent params={params} />
    </Suspense>
  );
}

async function DocContent({ params }: Pick<PageProps<"/docs/[...slug]">, "params">) {
  const { slug } = await params;
  const hub = await hubLanguage(slug);
  if (hub) return <DocsHub locale={hub} />;
  // /docs/<code>/… belongs to that language: its navigation, cards and chrome.
  const languages = await getLanguageSettings();
  const locale = localeFromSlug(slug.join("/"), languages);
  const [found, tabs, site, automation, glossary, comments] = await Promise.all([
    getPublishedPage(slug.join("/")),
    getNavigation(locale),
    getSiteSettings(),
    getAutomation(),
    getGlossary(),
    getCommentSettings(),
  ]);
  // Not public: an internal article, for signed-in team members only (session checked on the server).
  const internal = found ? null : await getInternalPage(slug.join("/"));
  const page = found ?? internal;
  if (!page) notFound();

  const href = slugToHref(page.slug);
  // Glossary terms (default language) get a definition tooltip on their first use.
  const doc = glossary.tooltips && locale === languages.defaultLocale ? applyGlossary(page.content, glossary.terms) : page.content;
  // Tema → Penulis: byline under the title and "Tentang penulis" after the content.
  const author = site.showAuthors === false ? null : await getAuthor(page.authorId);
  // Internal articles get no views, votes or comments.
  const footer = (
    <>
      <AuthorBox author={author} />
      {!internal && <ReaderFooter slug={page.slug} sectionFeedback={comments.sectionFeedback !== false} />}
    </>
  );
  const banner = internal ? <InternalBanner /> : undefined;
  const layout = site.layout ?? "docs";
  if (layout !== "docs") {
    const article = {
      href,
      title: page.title,
      description: page.description,
      doc,
      cover: page.coverImage,
      autoCover: !internal && automation.cover ? generatedCover(page.slug, "wide", automation.coverColor) : null,
      publishedAt: page.publishedAt?.toISOString() ?? null,
      readingMinutes: readingMinutes(page.content),
      author,
    };
    return (
      <div lang={locale}>
        <PublicationArticle layout={layout} article={article} tabs={tabs} footer={footer} banner={banner} locale={locale} />
      </div>
    );
  }
  const { prev, next } = getPager(tabs, href);
  return (
    <div lang={locale}>
      <DocArticle
        title={page.title}
        description={page.description}
        section={findPage(tabs, href)?.section}
        doc={doc}
        prev={prev}
        next={next}
        footer={footer}
        banner={banner}
        author={author}
      />
    </div>
  );
}
