import { Suspense } from "react";
import {
  getAskAiAvailable,
  getHomeAlternates,
  getLanguageSettings,
  getNavigation,
  getSearchIndex,
  getSiteSettings,
  getTranslationAlternates,
} from "@/lib/data/site";
import { SearchProvider } from "@/components/search";
import { SiteProvider } from "@/components/site-context";
import { SiteHeader } from "@/components/site-header";

export default async function SiteLayout({ children }: LayoutProps<"/">) {
  const [site, tabs, searchIndex, askAi, languages, pageAlternates, homes] = await Promise.all([
    getSiteSettings(),
    getNavigation(),
    getSearchIndex(),
    getAskAiAvailable(),
    getLanguageSettings(),
    getTranslationAlternates(),
    getHomeAlternates(),
  ]);
  // The switcher also moves between homes ("/" ↔ "/en") once a language has its own.
  const alternates = { ...pageAlternates, ...Object.fromEntries(Object.values(homes).map((href) => [href, homes])) };
  // Extra languages: their navigation and search entries, picked on the client by the path (/docs/<code>/…).
  const codes = languages.languages.map((language) => language.code);
  const [localeTabs, localeIndexes] = await Promise.all([
    Promise.all(codes.map((code) => getNavigation(code))),
    Promise.all(codes.map((code) => getSearchIndex(code))),
  ]);
  const i18n = {
    defaultLocale: languages.defaultLocale,
    defaultLabel: languages.defaultLabel,
    languages: languages.languages,
    tabsByLocale: Object.fromEntries(codes.map((code, i) => [code, localeTabs[i]])),
    alternates,
  };

  return (
    <SiteProvider value={{ site, tabs, i18n }}>
      <SearchProvider index={searchIndex} indexes={Object.fromEntries(codes.map((code, i) => [code, localeIndexes[i]]))} ai={askAi}>
        <Suspense>
          <SiteHeader />
        </Suspense>
        <div className="pt-(--header-h)">{children}</div>
      </SearchProvider>
    </SiteProvider>
  );
}
