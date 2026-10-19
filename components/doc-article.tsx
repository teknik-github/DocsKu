import type { JSONContent } from "@tiptap/core";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { tocHeadings } from "@/lib/content/doc";
import { toMarkdown } from "@/lib/content/markdown";
import { RenderDoc } from "@/lib/content/render";
import type { NavLink } from "@/lib/site-types";
import { CopyPageButton } from "@/components/copy-page-button";
import { SiteFooter } from "@/components/site-footer";
import { TableOfContents } from "@/components/toc";

/** A docs page body: title, content, prev/next links, and the table of contents. */
export function DocArticle({
  title,
  description,
  section,
  doc,
  prev,
  next,
  banner,
}: {
  title: string;
  description: string;
  section?: string;
  doc: JSONContent;
  prev?: NavLink;
  next?: NavLink;
  banner?: React.ReactNode;
}) {
  const markdown = `# ${title}\n\n${description ? `${description}\n\n` : ""}${toMarkdown(doc)}`;

  return (
    <>
      <div className="mx-auto flex max-w-6xl gap-12 px-5 pt-10 pb-20 sm:px-8 lg:pt-12">
        <article className="min-w-0 flex-1">
          {banner}
          <header className="mb-10">
            {section && <p className="mb-2 text-sm font-medium text-accent">{section}</p>}
            <div className="flex flex-wrap items-start justify-between gap-4">
              <h1 className="font-serif text-4xl font-light tracking-tight text-fg">{title}</h1>
              <CopyPageButton markdown={markdown} />
            </div>
            {description && <p className="mt-3 text-lg text-fg-muted">{description}</p>}
          </header>

          <div className="prose-docs">
            <RenderDoc doc={doc} />
          </div>

          {(prev || next) && (
            <nav aria-label="Navigasi halaman" className="mt-16 grid gap-4 sm:grid-cols-2">
              {prev ? (
                <Link
                  href={prev.href}
                  className="group rounded-xl border border-line p-4 transition-colors hover:border-line-strong hover:bg-fill/40"
                >
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
                <Link
                  href={next.href}
                  className="group rounded-xl border border-line p-4 text-right transition-colors hover:border-line-strong hover:bg-fill/40"
                >
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

        <aside className="hidden w-56 shrink-0 xl:block">
          <div className="sticky top-[calc(var(--header-h)+3rem)] max-h-[calc(100vh-var(--header-h)-4rem)] overflow-y-auto">
            <TableOfContents headings={tocHeadings(doc)} />
          </div>
        </aside>
      </div>
      <SiteFooter />
    </>
  );
}

export function DocSkeleton() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse px-5 pt-12 sm:px-8">
      <div className="h-4 w-24 rounded bg-fill" />
      <div className="mt-4 h-9 w-2/3 rounded bg-fill" />
      <div className="mt-4 h-5 w-1/2 rounded bg-fill" />
      <div className="mt-10 space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-4 rounded bg-fill" style={{ width: `${90 - i * 8}%` }} />
        ))}
      </div>
    </div>
  );
}
