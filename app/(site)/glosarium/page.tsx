import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getGlossary, getLanguageSettings } from "@/lib/data/site";
import { t } from "@/lib/i18n";
import type { GlossaryTerm } from "@/lib/site-types";
import { SiteFooter } from "@/components/site-footer";
import { T } from "@/components/locale-text";

/** /glosarium: every glossary term A–Z with its definition (Halaman → Glosarium in the dashboard). Not found while it is empty. */

export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const languages = await getLanguageSettings();
  return { title: t(languages.defaultLocale, "glossary"), description: t(languages.defaultLocale, "glossaryIntro") };
}

export default async function GlossaryPage() {
  // Decided before anything streams, so an empty glossary is a real 404.
  const glossary = await getGlossary();
  if (glossary.terms.length === 0) notFound();
  return (
    <Suspense>
      <Glossary terms={glossary.terms} />
    </Suspense>
  );
}

/** First letter for the A–Z index; digits and symbols share "#". */
const letterOf = (term: string) => {
  const first = term.trim().normalize("NFD").charAt(0).toLocaleUpperCase("id");
  return /\p{L}/u.test(first) ? first : "#";
};

function Glossary({ terms }: { terms: GlossaryTerm[] }) {
  const groups: { letter: string; terms: GlossaryTerm[] }[] = [];
  for (const term of terms) {
    const letter = letterOf(term.term);
    const group = groups.find((g) => g.letter === letter);
    if (group) group.terms.push(term);
    else groups.push({ letter, terms: [term] });
  }
  return (
    <>
      <div className="mx-auto max-w-3xl px-5 pt-12 pb-20 sm:px-8">
        <header className="border-b border-line pb-8">
          <h1 className="font-serif text-4xl font-light tracking-tight text-fg">
            <T k="glossary" />
          </h1>
          <p className="mt-2 text-base text-fg-muted">
            <T k="glossaryIntro" />
          </p>
          <nav aria-label="A–Z" className="mt-5 flex flex-wrap gap-1">
            {groups.map((group) => (
              <a
                key={group.letter}
                href={`#huruf-${group.letter}`}
                className="inline-flex size-8 items-center justify-center rounded-md border border-line text-sm text-fg-muted hover:border-line-strong hover:text-fg"
              >
                {group.letter}
              </a>
            ))}
          </nav>
        </header>
        {groups.map((group) => (
          <section key={group.letter} id={`huruf-${group.letter}`} className="mt-10 scroll-mt-24">
            <h2 className="mb-3 font-serif text-2xl text-accent">{group.letter}</h2>
            <dl className="divide-y divide-line">
              {group.terms.map((term) => (
                <div key={term.id} id={`istilah-${term.id}`} className="scroll-mt-24 py-4" data-glossary-entry>
                  <dt className="text-base font-semibold text-fg">
                    {term.term}
                    {term.aliases.length > 0 && <span className="ml-2 text-sm font-normal text-fg-subtle">({term.aliases.join(", ")})</span>}
                  </dt>
                  <dd className="mt-1 text-sm leading-relaxed whitespace-pre-line text-fg-muted">{term.definition}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <SiteFooter />
    </>
  );
}
