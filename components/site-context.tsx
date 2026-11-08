"use client";

import { createContext, use } from "react";
import { usePathname } from "next/navigation";
import { type NavTab, type SiteSettings, siteForLocale } from "@/lib/site-types";
import { type Alternates, type Language, localeFromPath } from "@/lib/i18n";

/** Extra languages (Pengaturan → Bahasa); absent when the site has only its default language. */
export type SiteI18n = {
  defaultLocale: string;
  defaultLabel: string;
  languages: Language[];
  /** Navigation per extra language. */
  tabsByLocale: Record<string, NavTab[]>;
  /** href → every published version of that page by language (docs pages, and "/" ↔ "/<code>" homes). */
  alternates: Record<string, Alternates>;
};

type SiteData = { site: SiteSettings; tabs: NavTab[]; i18n?: SiteI18n };

const SiteContext = createContext<SiteData | null>(null);

/** Gives client components (header, sidebar) the cached site settings and navigation. */
export function SiteProvider({ value, children }: { value: SiteData; children: React.ReactNode }) {
  return <SiteContext value={value}>{children}</SiteContext>;
}

/**
 * Site settings and the navigation of the language being read: the path
 * decides it (`/docs/<code>/…` is that language, everything else the default).
 */
export function useSite(): SiteData & { locale: string; homeHref: string } {
  const value = use(SiteContext);
  const pathname = usePathname();
  if (!value) throw new Error("useSite must be used inside <SiteProvider>");
  const i18n = value.i18n;
  if (!i18n) return { ...value, locale: "id", homeHref: "/" };
  const locale = localeFromPath(pathname, i18n);
  if (locale === i18n.defaultLocale) return { ...value, locale, homeHref: "/" };
  return {
    ...value,
    locale,
    // That language's description, header button and footer (Pengaturan → Umum).
    site: siteForLocale(value.site, locale),
    tabs: i18n.tabsByLocale[locale] ?? value.tabs,
    // Its own home when one is published, else the default home.
    homeHref: i18n.alternates["/"]?.[locale] ?? "/",
  };
}
