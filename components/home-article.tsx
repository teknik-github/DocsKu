import type { JSONContent } from "@tiptap/core";
import { RenderDoc } from "@/lib/content/render";
import { SiteFooter } from "@/components/site-footer";

/** The block-edited home page: full width, no sidebar or table of contents. */
export function HomeArticle({ doc, banner }: { doc: JSONContent; banner?: React.ReactNode }) {
  return (
    <>
      <main className="mx-auto max-w-6xl px-5 pt-8 pb-20 sm:px-8">
        {banner}
        <div className="prose-docs prose-home">
          <RenderDoc doc={doc} />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
