"use client";

import Link from "next/link";
import { Logo } from "@/components/logo";
import { useSite } from "@/components/site-context";

/**
 * The site footer in the language being read: `useSite()` applies that
 * language's description and columns (Pengaturan → Umum → per language), if any.
 */
export function SiteFooter() {
  const { site, homeHref } = useSite();
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
    </footer>
  );
}
