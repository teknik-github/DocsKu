import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Eye } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/dal";
import { getPageForEditor } from "@/lib/data/admin";
import { DocArticle, DocSkeleton } from "@/components/doc-article";
import { HomeArticle } from "@/components/home-article";
import { PublicationArticle } from "@/components/publication/registry";
import { getNavigation, getSiteSettings, readingMinutes } from "@/lib/data/site";
import { getAuthor } from "@/lib/data/authors";
import { AuthorBox } from "@/components/author";

export const metadata: Metadata = { title: "Pratinjau", robots: { index: false, follow: false } };

// Signed-in users only; renders the page's working copy.
export const instant = false;

export default function PreviewPage({ params }: PageProps<"/preview/[id]">) {
  return (
    <Suspense fallback={<DocSkeleton />}>
      <Preview params={params} />
    </Suspense>
  );
}

async function Preview({ params }: Pick<PageProps<"/preview/[id]">, "params">) {
  const { id } = await params;
  if (!(await getCurrentUser())) redirect(`/admin/login?next=/admin/pages/${encodeURIComponent(id)}`);
  const page = await getPageForEditor(id);
  if (!page) notFound();

  const banner = (
    <div className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent-soft/50 px-4 py-3 text-sm">
      <span className="flex items-center gap-2 text-fg">
        <Eye className="size-4 text-accent" />
        Pratinjau draf. Hanya terlihat oleh pengguna yang masuk.
      </span>
      <Link href={`/admin/pages/${page.id}`} className="font-medium text-accent hover:underline">
        Kembali ke editor
      </Link>
    </div>
  );

  if (page.kind === "home") return <HomeArticle doc={page.draftContent} banner={banner} />;

  // Preview with the layout visitors will see.
  // A translation previews with its language's navigation.
  const locale = page.translationOf ? page.locale : undefined;
  const [site, tabs] = await Promise.all([getSiteSettings(), getNavigation(locale)]);
  const layout = site.layout ?? "docs";
  const author = site.showAuthors === false ? null : await getAuthor(page.authorId ?? page.updatedById);
  const footer = <AuthorBox author={author} />;
  if (layout !== "docs") {
    const article = {
      href: `/docs/${page.slug}`,
      title: page.draftTitle || "Tanpa judul",
      description: page.draftDescription,
      doc: page.draftContent,
      cover: page.draftCoverImage,
      publishedAt: page.publishedAt?.toISOString() ?? null,
      readingMinutes: readingMinutes(page.draftContent),
      author,
    };
    return (
      <div lang={locale}>
        <PublicationArticle layout={layout} article={article} tabs={tabs} banner={banner} footer={footer} locale={locale} />
      </div>
    );
  }

  return (
    <div className="lg:px-8" lang={locale}>
      <DocArticle
        title={page.draftTitle || "Tanpa judul"}
        description={page.draftDescription}
        doc={page.draftContent}
        banner={banner}
        footer={footer}
        author={author}
      />
    </div>
  );
}
