"use client";

import Link from "next/link";
import { Rss } from "lucide-react";
import { Logo } from "@/components/logo";
import { useSite } from "@/components/site-context";
import { t } from "@/lib/i18n";

/**
 * The site footer in the language being read: `useSite()` applies that
 * language's description and columns (Pengaturan → Umum → per language), if any.
 */
export function SiteFooter() {
  const { site, homeHref, glossary, locale } = useSite();
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-12 md:flex-row md:justify-between">
        <div className="max-w-xs space-y-3">
          <Logo name={site.name} href={homeHref} />
          <p className="text-sm text-fg-subtle">{site.description}</p>
        </div>
        <div className="grid grid-cols-2 gap-10 sm:gap-16">
          {site.footer.map((column) => (
            <div key={column.title}>
              <div className="mb-3 text-xs font-medium text-fg">{column.title}</div>
              <ul className="space-y-2">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-fg-subtle transition-colors hover:text-fg">
                      {link.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 border-t border-line px-6 py-4 text-xs text-fg-subtle">
        <Link href="/terbaru" className="transition-colors hover:text-fg">
          {t(locale, "whatsNew")}
        </Link>
        {glossary && (
          <Link href="/glosarium" className="transition-colors hover:text-fg">
            {t(locale, "glossary")}
          </Link>
        )}
        <a href="/rss.xml" className="inline-flex items-center gap-1 transition-colors hover:text-fg">
          <Rss className="size-3" />
          RSS
        </a>
      </div>
    </footer>
  );
}
