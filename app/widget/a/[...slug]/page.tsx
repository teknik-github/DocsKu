import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { getPublishedPage, getPublishedSlugs, getWidgetSettings } from "@/lib/data/site";
import { RenderDoc } from "@/lib/content/render";
import { slugToHref } from "@/lib/navigation";
import { WidgetBack, WidgetView } from "@/components/widget/article-tools";

/**
 * The page decides "not found" from `params` before anything streams (a real
 * HTTP 404 instead of a 200 with not-found content), so a navigation to a slug
 * that wasn't prerendered waits for that check instead of showing a fallback first.
 */
export const instant = false;

export async function generateStaticParams() {
  const slugs = await getPublishedSlugs();
  // Cache Components needs at least one param; "_" renders the 404 page.
  return slugs.length ? slugs.map((slug) => ({ slug: slug.split("/") })) : [{ slug: ["_"] }];
}

/** A published article read inside the help widget, with a link to the full page. */
export default async function WidgetArticlePage({ params }: PageProps<"/widget/a/[...slug]">) {
  // Checked before anything streams, so a missing page (or the widget switched off) is a real HTTP 404.
  const { slug } = await params;
  const [widget, page] = await Promise.all([getWidgetSettings(), getPublishedPage(slug.join("/"))]);
  if (!widget.enabled || !page) notFound();
  return (
    <Suspense
      fallback={
        <div className="animate-pulse space-y-3 px-4 py-5">
          <div className="h-3 w-16 rounded bg-fill" />
          <div className="h-6 w-3/4 rounded bg-fill" />
          <div className="h-3 w-full rounded bg-fill" />
          <div className="h-3 w-5/6 rounded bg-fill" />
        </div>
      }
    >
      <WidgetArticle page={page} />
    </Suspense>
  );
}

function WidgetArticle({ page }: { page: NonNullable<Awaited<ReturnType<typeof getPublishedPage>>> }) {
  const href = slugToHref(page.slug);

  return (
    <article className="px-4 py-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <WidgetBack />
        <a href={href} target="_blank" rel="noopener" className="flex items-center gap-1 text-xs text-accent hover:underline">
          Buka di tab baru
          <ExternalLink className="size-3" />
        </a>
      </div>
      <h1 className="text-xl font-semibold tracking-tight text-fg">{page.title}</h1>
      {page.description && <p className="mt-1.5 text-sm text-fg-muted">{page.description}</p>}
      <div className="prose-docs mt-5 [&_:is(h2,h3,h4)]:scroll-mt-4! [&_h2]:mt-8! [&_h2]:text-lg! [&_h3]:text-base!">
        <RenderDoc doc={page.content} />
      </div>
      <div className="mt-8 border-t border-line pt-4 text-center">
        <a href={href} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg">
          Baca di situs dokumentasi, dengan komentar dan artikel terkait
          <ExternalLink className="size-3" />
        </a>
      </div>
      <WidgetView slug={page.slug} />
    </article>
  );
}
