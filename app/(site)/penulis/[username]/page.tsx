import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { getAuthorPage, getAuthorUsernames } from "@/lib/data/authors";
import { getLanguageSettings, getPageCards, getSiteSettings } from "@/lib/data/site";
import { t } from "@/lib/i18n";
import type { PageCard } from "@/lib/site-types";
import { Avatar } from "@/components/avatar";
import { PageCardView } from "@/components/publication/cards";
import { SiteFooter } from "@/components/site-footer";
import { T } from "@/components/locale-text";

/**
 * /penulis/<username>: an author's public profile and their published public
 * articles. 404 for unknown usernames, authors with nothing public, or when
 * Tema → Penulis is off.
 */

export async function generateStaticParams() {
  const usernames = await getAuthorUsernames();
  // Cache Components needs at least one param; "_" renders the 404 page.
  return usernames.length ? usernames.map((username) => ({ username })) : [{ username: "_" }];
}

async function load(username: string) {
  const site = await getSiteSettings();
  if (site.showAuthors === false) return null;
  return getAuthorPage(username);
}

export async function generateMetadata({ params }: PageProps<"/penulis/[username]">): Promise<Metadata> {
  const { username } = await params;
  const [data, languages] = await Promise.all([load(username), getLanguageSettings()]);
  if (!data) return { robots: { index: false, follow: false } };
  const { author } = data;
  const description = author.bio || author.jobTitle || t(languages.defaultLocale, "articlesBy", { name: author.name });
  return {
    title: `${author.name} — ${t(languages.defaultLocale, "author")}`,
    description: description.slice(0, 160),
    openGraph: { type: "profile", title: author.name, description: description.slice(0, 160), ...(author.avatar ? { images: [author.avatar] } : {}) },
  };
}

export default function AuthorPage({ params }: PageProps<"/penulis/[username]">) {
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-5xl animate-pulse px-5 pt-12 sm:px-8" />}>
      <AuthorContent params={params} />
    </Suspense>
  );
}

async function AuthorContent({ params }: Pick<PageProps<"/penulis/[username]">, "params">) {
  const { username } = await params;
  const data = await load(username);
  if (!data) notFound();
  const { author, pages } = data;
  const languages = await getLanguageSettings();
  // Cards of every language the author has written in.
  const locales = [...new Set(pages.map((page) => page.locale))];
  const cardLists = await Promise.all(locales.map((locale) => getPageCards(locale === languages.defaultLocale ? undefined : locale)));
  const cards = new Map<string, PageCard>(cardLists.flat().map((card) => [card.href, card]));
  const labels = new Map(languages.languages.map((language) => [language.code, language.code.toUpperCase()]));
  const list = pages.flatMap((page) => {
    const card = cards.get(page.href);
    return card ? [{ card, tag: labels.get(page.locale) }] : [];
  });

  return (
    <>
      <div className="mx-auto max-w-5xl px-5 pt-12 pb-20 sm:px-8">
        <header className="flex flex-col items-center gap-5 border-b border-line pb-10 text-center sm:flex-row sm:items-start sm:text-left">
          <Avatar name={author.name} src={author.avatar} size={112} className="text-3xl" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium tracking-wide text-fg-subtle uppercase">
              <T k="author" />
            </p>
            <h1 className="mt-1 font-serif text-4xl font-light tracking-tight text-fg">{author.name}</h1>
            {author.jobTitle && <p className="mt-1 text-base text-accent">{author.jobTitle}</p>}
            {author.bio && <p className="mt-4 max-w-2xl text-base leading-relaxed whitespace-pre-line text-fg-muted">{author.bio}</p>}
            {author.links.length > 0 && (
              <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
                {author.links.map((link) => (
                  <a
                    key={link.url}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-sm text-fg-muted hover:border-line-strong hover:text-fg"
                  >
                    {link.label}
                    <ExternalLink className="size-3" />
                  </a>
                ))}
              </div>
            )}
          </div>
        </header>

        <section className="mt-10">
          <h2 className="mb-6 flex items-baseline gap-2 text-lg font-semibold text-fg">
            <T k="articlesBy" vars={{ name: author.name }} />
            <span className="text-sm font-normal text-fg-subtle">
              · <T k="nArticles" vars={{ n: list.length }} />
            </span>
          </h2>
          <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {list.map(({ card, tag }) => (
              <PageCardView key={card.href} card={card} tag={tag} />
            ))}
          </div>
        </section>
      </div>
      <SiteFooter />
    </>
  );
}
