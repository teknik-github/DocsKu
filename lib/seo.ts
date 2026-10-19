import type { Metadata } from "next";
import type { PageSeo } from "@/lib/site-types";

/** Next.js metadata for a page, preferring its SEO fields over the title/description. */
export function pageMetadata(
  page: { title: string; description: string; seo?: PageSeo | null; /** Fallback social image, e.g. the cover. */ image?: string | null },
  type: "article" | "website" = "article",
): Metadata {
  const seo = page.seo ?? {};
  const title = seo.title || page.title;
  const description = seo.description || page.description || undefined;
  const image = seo.image || page.image || undefined;
  return {
    // A custom meta title is used as-is, without the " · Site Docs" suffix.
    title: seo.title ? { absolute: seo.title } : page.title,
    description,
    openGraph: { title, description, type, images: image ? [image] : undefined },
    twitter: { card: image ? "summary_large_image" : "summary", title, description, images: image ? [image] : undefined },
    robots: seo.noindex ? { index: false, follow: true } : undefined,
  };
}
