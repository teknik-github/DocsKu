import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  generatedCover,
  getAutomation,
  getNavigation,
  getPageCards,
  getPublishedPage,
  getPublishedSlugs,
  getSiteSettings,
  readingMinutes,
} from "@/lib/data/site";
import { GhostArticle, HybridArticle } from "@/components/publication/articles";
import { findPage, getPager, slugToHref } from "@/lib/navigation";
import { DocArticle, DocSkeleton } from "@/components/doc-article";
import { ReaderFooter } from "@/components/reader-footer";
import { pageMetadata } from "@/lib/seo";

export async function generateStaticParams() {
  const slugs = await getPublishedSlugs();
  // Cache Components needs at least one param; "_" renders the 404 page.
  return slugs.length ? slugs.map((slug) => ({ slug: slug.split("/") })) : [{ slug: ["_"] }];
}

export async function generateMetadata({
  params,
}: PageProps<"/docs/[...slug]">): Promise<Metadata> {
  const { slug } = await params;
  const [page, automation] = await Promise.all([getPublishedPage(slug.join("/")), getAutomation()]);
  if (!page) return {};
  return pageMetadata({ ...page, image: page.coverImage ?? (automation.cover ? generatedCover(page.slug, "og", automation.coverColor) : null) });
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
  const [page, tabs, site, automation] = await Promise.all([
    getPublishedPage(slug.join("/")),
    getNavigation(),
    getSiteSettings(),
    getAutomation(),
  ]);
  if (!page) notFound();

  const href = slugToHref(page.slug);
  const footer = <ReaderFooter slug={page.slug} />;
  const layout = site.layout ?? "docs";
  if (layout !== "docs") {
    const cards = new Map((await getPageCards()).map((card) => [card.href, card]));
    const article = {
      href,
      title: page.title,
      description: page.description,
      doc: page.content,
      cover: page.coverImage,
      autoCover: automation.cover ? generatedCover(page.slug, "wide", automation.coverColor) : null,
      publishedAt: page.publishedAt?.toISOString() ?? null,
      readingMinutes: readingMinutes(page.content),
    };
    return layout === "ghost" ? (
      <GhostArticle article={article} tabs={tabs} cards={cards} footer={footer} />
    ) : (
      <HybridArticle article={article} tabs={tabs} cards={cards} footer={footer} />
    );
  }
  const { prev, next } = getPager(tabs, href);
  return (
    <DocArticle
      title={page.title}
      description={page.description}
      section={findPage(tabs, href)?.section}
      doc={page.content}
      prev={prev}
      next={next}
      footer={footer}
    />
  );
}
