import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { HomeSections } from "@/components/home/sections";
import { getHomeAlternates, getHomeSections, getLanguageSettings, getSiteSettings } from "@/lib/data/site";
import { siteForLocale } from "@/lib/site-types";

/**
 * /<code>: the home of an extra language (Pengaturan → Bahasa), built in the
 * dashboard's Beranda with that language selected (settings key `home:<code>`).
 * A language without a published home redirects to its docs hub (/docs/<code>).
 * Any other first path segment is a real 404, decided before anything streams.
 */
export const instant = false;

export async function generateStaticParams() {
  const languages = await getLanguageSettings();
  const codes = languages.languages.map((language) => language.code);
  // Cache Components needs at least one param; "_" renders the 404 page.
  return codes.length ? codes.map((lang) => ({ lang })) : [{ lang: "_" }];
}

async function enabled(lang: string) {
  const languages = await getLanguageSettings();
  return languages.languages.some((language) => language.code === lang);
}

export async function generateMetadata({ params }: PageProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!(await enabled(lang))) return {};
  const [site, homes] = await Promise.all([getSiteSettings(), getHomeAlternates()]);
  return {
    description: siteForLocale(site, lang).description,
    alternates: Object.keys(homes).length ? { languages: { ...homes, "x-default": "/" } } : undefined,
  };
}

export default async function LanguageHome({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!(await enabled(lang))) notFound();
  const sections = await getHomeSections(lang);
  if (!sections) redirect(`/docs/${lang}`);
  return (
    <div lang={lang}>
      <HomeSections sections={sections} locale={lang} />
    </div>
  );
}
