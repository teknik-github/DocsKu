import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Rss } from "lucide-react";
import { getChangelog, type ChangelogEntry } from "@/lib/data/changelog";
import { getLanguageSettings, getSiteSettings } from "@/lib/data/site";
import { t } from "@/lib/i18n";
import { SiteFooter } from "@/components/site-footer";
import { LocalDate, T } from "@/components/locale-text";

/** /terbaru: "Apa yang baru", newly published and updated articles, newest first, with an RSS feed (/rss.xml). */

export async function generateMetadata(): Promise<Metadata> {
  const languages = await getLanguageSettings();
  return {
    title: t(languages.defaultLocale, "whatsNew"),
    description: t(languages.defaultLocale, "whatsNewIntro"),
    alternates: { types: { "application/rss+xml": "/rss.xml" } },
  };
}

export default function WhatsNewPage() {
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-3xl animate-pulse px-5 pt-12 sm:px-8" />}>
      <WhatsNew />
    </Suspense>
  );
}

const monthKey = (iso: string) => iso.slice(0, 7);

async function WhatsNew() {
  const [entries, site, languages] = await Promise.all([getChangelog(), getSiteSettings(), getLanguageSettings()]);
  const showAuthors = site.showAuthors !== false;
  const monthFormat = new Intl.DateTimeFormat(languages.defaultLocale === "id" ? "id-ID" : languages.defaultLocale, {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
  const months: { key: string; label: string; entries: ChangelogEntry[] }[] = [];
  for (const entry of entries) {
    const key = monthKey(entry.date);
    let month = months.at(-1);
    if (!month || month.key !== key) {
      month = { key, label: monthFormat.format(new Date(entry.date)), entries: [] };
      months.push(month);
    }
    month.entries.push(entry);
  }

  return (
    <>
      <div className="mx-auto max-w-3xl px-5 pt-12 pb-20 sm:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-8">
          <div>
            <h1 className="font-serif text-4xl font-light tracking-tight text-fg">
              <T k="whatsNew" />
            </h1>
            <p className="mt-2 text-base text-fg-muted">
              <T k="whatsNewIntro" />
            </p>
          </div>
          <a
            href="/rss.xml"
            className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
          >
            <Rss className="size-3.5" />
            <T k="rssFeed" />
          </a>
        </header>

        {months.length === 0 ? (
          <p className="py-16 text-center text-sm text-fg-subtle">
            <T k="noPages" />
          </p>
        ) : (
          months.map((month) => (
            <section key={month.key} className="mt-10">
              <h2 className="mb-4 text-xs font-medium tracking-wide text-fg-subtle uppercase">{month.label}</h2>
              <ol className="relative space-y-6 border-l border-line pl-6">
                {month.entries.map((entry) => (
                  <li key={entry.href} className="relative" data-changelog-entry>
                    <span
                      aria-hidden
                      className={`absolute top-1.5 -left-[1.72rem] size-2.5 rounded-full ring-4 ring-page ${entry.kind === "new" ? "bg-accent" : "bg-fg-subtle"}`}
                    />
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-subtle">
                      <span
                        className={`rounded-full px-2 py-px font-medium ${
                          entry.kind === "new" ? "bg-accent-soft text-accent" : "bg-fill text-fg-muted"
                        }`}
                      >
                        <T k={entry.kind === "new" ? "newBadge" : "updatedBadge"} />
                      </span>
                      <time dateTime={entry.date}>
                        <LocalDate value={entry.date} />
                      </time>
                      {entry.group && <span>· {entry.group}</span>}
                      {showAuthors && entry.author && <span>· {entry.author}</span>}
                    </div>
                    <Link href={entry.href} className="mt-1 block text-lg font-medium text-fg hover:text-accent">
                      {entry.title}
                    </Link>
                    {entry.description && <p className="mt-1 text-sm leading-relaxed text-fg-muted">{entry.description}</p>}
                  </li>
                ))}
              </ol>
            </section>
          ))
        )}
      </div>
      <SiteFooter />
    </>
  );
}
