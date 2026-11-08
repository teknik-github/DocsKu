import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  generatedCover,
  getAutomation,
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
import { InternalBanner } from "@/components/internal-banner";
import { getAuthor } from "@/lib/data/authors";
import { AuthorBox } from "@/components/author";

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

export default function DocPage({ params }: PageProps<"/docs/[...slug]">) {
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
  const locale = localeFromSlug(slug.join("/"), await getLanguageSettings());
  const [found, tabs, site, automation] = await Promise.all([
    getPublishedPage(slug.join("/")),
    getNavigation(locale),
    getSiteSettings(),
    getAutomation(),
  ]);
  // Not public: an internal article, for signed-in team members only (session checked on the server).
  const internal = found ? null : await getInternalPage(slug.join("/"));
  const page = found ?? internal;
  if (!page) notFound();

  const href = slugToHref(page.slug);
  // Tema → Penulis: byline under the title and "Tentang penulis" after the content.
  const author = site.showAuthors === false ? null : await getAuthor(page.authorId);
  // Internal articles get no views, votes or comments.
  const footer = (
    <>
      <AuthorBox author={author} />
      {!internal && <ReaderFooter slug={page.slug} />}
    </>
  );
  const banner = internal ? <InternalBanner /> : undefined;
  const layout = site.layout ?? "docs";
  if (layout !== "docs") {
    const article = {
      href,
      title: page.title,
      description: page.description,
      doc: page.content,
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
        doc={page.content}
        prev={prev}
        next={next}
        footer={footer}
        banner={banner}
        author={author}
      />
    </div>
  );
}
