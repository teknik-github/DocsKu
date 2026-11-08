"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Check, ChevronDown, Languages, Menu, X } from "lucide-react";
import { findTab, sectionPages, topicSlug } from "@/lib/navigation";
import type { NavTab } from "@/lib/site-types";
import { HUB_ANCHOR_LAYOUTS } from "@/lib/docs-layouts";
import { Logo } from "@/components/logo";
import { SearchIconButton } from "@/components/search";
import { SidebarNav } from "@/components/sidebar";
import { useSite, versionFromPath } from "@/components/site-context";
import { ThemeToggle } from "@/components/theme";
import { hubHref, t } from "@/lib/i18n";

const isExternal = (href: string) => /^https?:\/\//.test(href);

export function SiteHeader() {
  const pathname = usePathname();
  const { site, tabs, locale, i18n, homeHref } = useSite();
  const activeTab = findTab(tabs, pathname);
  const layout = site.layout ?? "docs";
  // The hub of the language being read: /docs, or /docs/<code>.
  const hub = hubHref(locale, i18n?.defaultLocale ?? locale);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="fixed inset-x-0 top-0 z-40 flex h-(--header-h) items-center gap-4 border-b border-line bg-page/90 px-4 backdrop-blur-md lg:px-5">
      <Logo name={site.name} href={homeHref} />

      <nav aria-label={t(locale, "docSections")} className="ml-4 hidden h-full items-center gap-1 lg:flex">
        {tabs.map((tab) => {
          const active = activeTab?.title === tab.title;
          const className = `flex h-8 items-center gap-1 rounded-full px-3 text-sm whitespace-nowrap transition-colors ${
            active ? "bg-fill text-fg" : "text-fg-muted hover:bg-fill/70 hover:text-fg"
          }`;
          if (layout === "hybrid") return <TabMenu key={tab.title} tab={tab} className={className} />;
          return (
            <Link
              key={tab.title}
              // Ghost opens the card hub filtered to this tab; the help centre and magazine jump to its block on the hub.
              href={
                layout === "ghost"
                  ? `${hub}?topik=${topicSlug(tab.title)}`
                  : HUB_ANCHOR_LAYOUTS.includes(layout)
                    ? `${hub}#${topicSlug(tab.title)}`
                    : tab.href
              }
              className={className}
            >
              {tab.title}
            </Link>
          );
        })}
        {site.resources.length > 0 && <ResourcesMenu />}
      </nav>

      <div className="ml-auto flex items-center gap-1.5">
        <SearchIconButton />
        <VersionMenu />
        <LanguageMenu />
        <ThemeToggle />
        {site.headerCta && (
          <Link
            href={site.headerCta.href}
            className="ml-1 hidden h-8 items-center rounded-full bg-fg px-3.5 text-sm font-medium text-page transition-opacity hover:opacity-85 sm:flex"
          >
            {site.headerCta.title}
          </Link>
        )}
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label={t(locale, "openMenu")}
          className="inline-flex size-8 items-center justify-center rounded-full text-fg-muted hover:bg-fill hover:text-fg lg:hidden"
        >
          <Menu className="size-4.5" />
        </button>
      </div>

      {mobileOpen && (
        <MobileMenu tab={activeTab ?? tabs[0]} onClose={() => setMobileOpen(false)} />
      )}
    </header>
  );
}

/** Hybrid layout: a tab opens a panel listing its sections and pages. */
function TabMenu({ tab, className }: { tab: NavTab; className: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const columns = Math.min(Math.max(tab.sections.length, 1), 3);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className={className}>
        {tab.title}
        <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          className="absolute top-full left-0 mt-2 grid gap-6 rounded-xl border border-line bg-surface p-5 shadow-xl"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(12rem, 1fr))` }}
        >
          {tab.sections.map((section) => (
            <div key={section.title}>
              <p className="mb-2 text-[11px] font-semibold tracking-wide text-fg-subtle uppercase">{section.title}</p>
              <ul className="space-y-0.5">
                {sectionPages(section).map((page) => (
                  <li key={page.href}>
                    <Link
                      href={page.href}
                      prefetch={true}
                      onClick={() => setOpen(false)}
                      className="-mx-2 block rounded-md px-2 py-1.5 text-sm text-fg-muted hover:bg-fill hover:text-fg"
                    >
                      {page.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Shown once a documentation version was archived: the live docs and each archived version. */
function VersionMenu() {
  const pathname = usePathname();
  const { versions } = useSite();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!versions?.list.length) return null;
  const archived = versionFromPath(pathname, versions);
  const current = archived?.label ?? versions.current;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={`Versi: ${current}`}
        data-testid="version-menu"
        className={`inline-flex h-8 max-w-36 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition-colors hover:bg-fill ${archived ? "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300" : "text-fg-muted hover:text-fg"}`}
      >
        <span className="truncate">{current}</span>
        <ChevronDown className="size-3.5 shrink-0" />
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-2 w-56 rounded-xl border border-line bg-surface p-1.5 shadow-lg">
          <p className="px-3 pt-1.5 pb-1 text-[11px] font-semibold tracking-wide text-fg-subtle uppercase">Versi</p>
          <Link href="/docs" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-fill">
            <span className="flex-1 text-fg">
              {versions.current} <span className="text-xs text-fg-subtle">(terbaru)</span>
            </span>
            {!archived && <Check className="size-3.5 text-accent" />}
          </Link>
          {versions.list.map((version) => (
            <Link key={version.slug} href={`/docs/v/${version.slug}`} onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-fill">
              <span className="flex-1 text-fg">{version.label}</span>
              {archived?.slug === version.slug && <Check className="size-3.5 text-accent" />}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** Shown when the site has extra languages: links to this page in each language, or to that language's hub. */
function LanguageMenu() {
  const pathname = usePathname();
  const { locale, i18n } = useSite();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!i18n?.languages.length) return null;
  const all = [{ code: i18n.defaultLocale, label: i18n.defaultLabel }, ...i18n.languages];
  const versions = i18n.alternates[pathname];
  const current = all.find((language) => language.code === locale) ?? all[0];
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={`${t(locale, "language")}: ${current.label}`}
        data-testid="language-menu"
        className="inline-flex h-8 items-center gap-1 rounded-full px-2 text-xs font-medium text-fg-muted uppercase transition-colors hover:bg-fill hover:text-fg"
      >
        <Languages className="size-4" />
        {current.code}
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-2 w-56 rounded-xl border border-line bg-surface p-1.5 shadow-lg">
          <p className="px-3 pt-1.5 pb-1 text-[11px] font-semibold tracking-wide text-fg-subtle uppercase">{t(locale, "language")}</p>
          {all.map((language) => {
            const translated = versions?.[language.code];
            const href = translated ?? hubHref(language.code, i18n.defaultLocale);
            return (
              <Link
                key={language.code}
                href={href}
                hrefLang={language.code}
                lang={language.code}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-fill"
              >
                <span className="flex-1">
                  <span className="block text-fg">{language.label}</span>
                  {!translated && pathname.startsWith("/docs/") && language.code !== locale && (
                    <span className="block text-xs text-fg-subtle">{t(language.code, "translationMissing")}</span>
                  )}
                </span>
                {language.code === locale && <Check className="size-3.5 text-accent" />}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ResourcesMenu() {
  const { site, locale } = useSite();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex h-8 items-center gap-1 rounded-full px-3 text-sm text-fg-muted transition-colors hover:bg-fill/70 hover:text-fg"
      >
        {t(locale, "resources")}
        <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-2 w-64 rounded-xl border border-line bg-surface p-1.5 shadow-lg">
          {site.resources.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              target={isExternal(link.href) ? "_blank" : undefined}
              rel={isExternal(link.href) ? "noreferrer" : undefined}
              className="flex items-start gap-2 rounded-lg px-3 py-2 hover:bg-fill"
            >
              <span className="flex-1">
                <span className="block text-sm text-fg">{link.title}</span>
                {link.description && (
                  <span className="block text-xs text-fg-subtle">{link.description}</span>
                )}
              </span>
              {isExternal(link.href) && <ArrowUpRight className="mt-0.5 size-3.5 text-fg-subtle" />}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function MobileMenu({ tab, onClose }: { tab: NavTab | undefined; onClose: () => void }) {
  const { site, tabs, locale } = useSite();
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 flex w-[min(20rem,85vw)] flex-col border-l border-line bg-page">
        <div className="flex h-(--header-h) items-center justify-between border-b border-line px-4">
          <span className="text-sm font-medium">{t(locale, "menu")}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t(locale, "closeMenu")}
            className="inline-flex size-8 items-center justify-center rounded-full text-fg-muted hover:bg-fill"
          >
            <X className="size-4.5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-6 flex flex-wrap gap-1.5">
            {tabs.map((tab) => (
              <Link
                key={tab.title}
                href={tab.href}
                onClick={onClose}
                className="rounded-full border border-line px-3 py-1 text-sm text-fg-muted hover:bg-fill hover:text-fg"
              >
                {tab.title}
              </Link>
            ))}
            {site.resources.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={onClose}
                className="rounded-full border border-line px-3 py-1 text-sm text-fg-muted hover:bg-fill hover:text-fg"
              >
                {link.title}
              </Link>
            ))}
          </div>
          {tab && <SidebarNav tab={tab} onNavigate={onClose} />}
        </div>
      </div>
    </div>
  );
}
