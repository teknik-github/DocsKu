import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getNavigation, getSiteSettings } from "@/lib/data/site";
import { PublicationHub } from "@/components/publication/registry";
import { tabPages } from "@/lib/navigation";
import { SiteFooter } from "@/components/site-footer";
import { t } from "@/lib/i18n";

/**
 * The docs hub (/docs, or /docs/<code> for an extra language): the layout's
 * hub, or the plain overview of every tab and section for the "docs" layout.
 */
export async function DocsHub({ locale }: { locale?: string }) {
  const [tabs, site] = await Promise.all([getNavigation(locale), getSiteSettings()]);
  const layout = site.layout ?? "docs";
  if (layout !== "docs") {
    return (
      <div lang={locale}>
        <PublicationHub layout={layout} site={site} tabs={tabs} locale={locale} />
        <SiteFooter />
      </div>
    );
  }

  return (
    <div lang={locale}>
      <main className="mx-auto max-w-5xl px-5 pt-12 pb-20 sm:px-8">
        <h1 className="font-serif text-4xl font-light tracking-tight text-fg">{t(locale, "docs")}</h1>
        <p className="mt-3 text-lg text-fg-muted">{t(locale, "docsIntro")}</p>

        {tabs.length === 0 && (
          <p className="mt-10 rounded-xl border border-line bg-surface p-6 text-sm text-fg-muted">{t(locale, "noPages")}</p>
        )}

        {tabs.map((tab) => (
          <section key={tab.title} className="mt-12">
            <h2 className="text-xl font-semibold text-fg">{tab.title}</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {tab.sections.map((section) => {
                const pages = tabPages({ ...tab, sections: [section] });
                return (
                  <div key={section.title} className="rounded-xl border border-line bg-surface p-5">
                    <h3 className="text-sm font-medium text-fg">{section.title}</h3>
                    <ul className="mt-3 space-y-1.5">
                      {pages.map((page) => (
                        <li key={page.href}>
                          <Link href={page.href} className="group flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg">
                            {page.title}
                            <ArrowRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </main>
      <SiteFooter />
    </div>
  );
}
