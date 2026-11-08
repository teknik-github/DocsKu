"use client";

import Link from "next/link";
import { useSite } from "@/components/site-context";
import { type I18nKey, dateLocale, hubHref, t } from "@/lib/i18n";

/**
 * Reader chrome in the language being read, for server components that don't
 * know it: the path decides (`/docs/<code>/…`), like the navigation.
 * `<T k="prev" />` renders "Sebelumnya" or "Previous".
 */
export function T({ k, vars }: { k: I18nKey; vars?: Record<string, string | number> }) {
  const { locale } = useSite();
  return t(locale, k, vars);
}

export function useLocale() {
  return useSite().locale;
}

const formats = new Map<string, Intl.DateTimeFormat>();

/** A date ("18 Okt 2026" / "Oct 18, 2026") in the reader's language and the site's time zone. */
export function LocalDate({ value }: { value: string | Date | null | undefined }) {
  const { locale } = useSite();
  if (!value) return null;
  const tag = dateLocale(locale);
  let format = formats.get(tag);
  if (!format) {
    format = new Intl.DateTimeFormat(tag, { day: "numeric", month: "short", year: "numeric", timeZone: process.env.NEXT_PUBLIC_TIME_ZONE || "Asia/Jakarta" });
    formats.set(tag, format);
  }
  return format.format(new Date(value));
}

/** The docs hub of the language being read (/docs or /docs/<code>), plus an optional `?…`/`#…` suffix. */
export function useHubHref(suffix = "") {
  const { locale, i18n } = useSite();
  return hubHref(locale, i18n?.defaultLocale ?? locale) + suffix;
}

/** A link to that hub, for server components. */
export function HubLink({ suffix = "", className, children }: { suffix?: string; className?: string; children: React.ReactNode }) {
  return (
    <Link href={useHubHref(suffix)} className={className}>
      {children}
    </Link>
  );
}
