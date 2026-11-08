import Link from "next/link";
import { notFound } from "next/navigation";
import { History } from "lucide-react";
import { getPublishedPage, getSiteSettings, readingMinutes } from "@/lib/data/site";
import { getPager, findPage, sectionPages } from "@/lib/navigation";
import { getVersionNavs, getVersionPage, getVersionPages, getVersionSettings, versionHref } from "@/lib/versions";
import { DocArticle } from "@/components/doc-article";
import { PublicationArticle } from "@/components/publication/registry";
import { SiteFooter } from "@/components/site-footer";

/** /docs/v/<version>[/<slug>]: the version and (for an article) its archived page, or null. */
export async function archiveTarget(slug: string[]) {
  if (slug[0] !== "v" || slug.length < 2) return null;
  const version = (await getVersionNavs()).find((entry) => entry.slug === slug[1]);
  if (!version) return null;
  const pageSlug = slug.slice(2).join("/");
  const page = pageSlug ? await getVersionPage(version.slug, pageSlug) : null;
  return { version, page, pageSlug };
}

/** "You are reading version X" with a link to the same page in the live docs, if it still exists. */
async function VersionBanner({ label, pageSlug }: { label: string; pageSlug: string }) {
  const [settings, live] = await Promise.all([getVersionSettings(), pageSlug ? getPublishedPage(pageSlug) : null]);
  return (
    <div
      data-testid="version-banner"
      className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
    >
      <span className="flex items-center gap-2">
        <History className="size-4 shrink-0" />
        Anda membaca dokumentasi versi lama <b>{label}</b>.
      </span>
      <Link href={live ? `/docs/${pageSlug}` : "/docs"} className="font-medium underline-offset-2 hover:underline">
        {live ? `Lihat halaman ini di versi ${settings.currentLabel}` : `Ke dokumentasi ${settings.currentLabel}`} →
      </Link>
    </div>
  );
}

export async function ArchivedDoc({ slug }: { slug: string[] }) {
  const target = await archiveTarget(slug);
  if (!target) notFound();
  const { version, page, pageSlug } = target;
  const banner = <VersionBanner label={version.label} pageSlug={pageSlug} />;

  if (!page) {
    // The version's hub: its navigation, then archived pages that weren't listed there.
    const pages = await getVersionPages(version.slug);
    const listed = new Set(version.tabs.flatMap((tab) => tab.sections.flatMap((section) => sectionPages(section).map((p) => p.href))));
    const rest = pages.filter((p) => !listed.has(versionHref(version.slug, p.slug)));
    return (
      <>
        <div className="mx-auto max-w-4xl px-5 pt-12 pb-20 sm:px-8" data-testid="version-hub">
          {banner}
          <h1 className="font-serif text-4xl font-light tracking-tight text-fg">Dokumentasi {version.label}</h1>
          <p className="mt-2 text-fg-muted">{pages.length} halaman, diarsipkan apa adanya. Versi ini hanya bisa dibaca.</p>
          <div className="mt-10 space-y-10">
            {version.tabs.map((tab) => (
              <section key={tab.title}>
                <h2 className="mb-4 text-xs font-semibold tracking-wide text-fg-subtle uppercase">{tab.title}</h2>
                <div className="grid gap-6 sm:grid-cols-2">
                  {tab.sections.map((section) => (
                    <div key={section.title}>
                      <h3 className="mb-2 text-sm font-medium text-fg">{section.title}</h3>
                      <ul className="space-y-1">
                        {sectionPages(section).map((item) => (
                          <li key={item.href}>
                            <Link href={item.href} className="text-sm text-fg-muted hover:text-accent">
                              {item.title}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            ))}
            {rest.length > 0 && (
              <section>
                <h2 className="mb-4 text-xs font-semibold tracking-wide text-fg-subtle uppercase">Lainnya</h2>
                <ul className="space-y-1">
                  {rest.map((item) => (
                    <li key={item.slug}>
                      <Link href={versionHref(version.slug, item.slug)} className="text-sm text-fg-muted hover:text-accent">
                        {item.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
        <SiteFooter />
      </>
    );
  }

  const site = await getSiteSettings();
  const href = versionHref(version.slug, pageSlug);
  const layout = site.layout ?? "docs";
  if (layout !== "docs") {
    const article = { href, title: page.title, description: page.description, doc: page.content, cover: null, publishedAt: page.publishedAt, readingMinutes: readingMinutes(page.content), author: null };
    return <PublicationArticle layout={layout} article={article} tabs={version.tabs} banner={banner} />;
  }
  const { prev, next } = getPager(version.tabs, href);
  return (
    <DocArticle title={page.title} description={page.description} section={findPage(version.tabs, href)?.section} doc={page.content} prev={prev} next={next} banner={banner} />
  );
}
