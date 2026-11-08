import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Icon } from "@/components/icon";
import { categoryIcon } from "@/lib/category-icon";
import { locate, sectionPages } from "@/lib/navigation";
import type { NavLink, NavTab, PageCard } from "@/lib/site-types";
import { HubLink, T } from "@/components/locale-text";
import { fixedImage } from "@/lib/responsive-image";

/** Pieces shared by the layouts in components/publication/. */

export type Place = NonNullable<ReturnType<typeof locate>>;

export function Breadcrumb({ place, root = <T k="docs" />, className = "" }: { place: Place | null; root?: React.ReactNode; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={`flex min-w-0 flex-wrap items-center gap-1.5 text-sm text-fg-subtle ${className}`}>
      <HubLink className="hover:text-fg">{root}</HubLink>
      {place && (
        <>
          <ChevronRight className="size-3.5 shrink-0" aria-hidden />
          <Link href={place.tab.href} className="hover:text-fg">
            {place.tab.title}
          </Link>
          <ChevronRight className="size-3.5 shrink-0" aria-hidden />
          <span className="text-fg-muted">{place.section.title}</span>
        </>
      )}
    </nav>
  );
}

/** A category's picture: its uploaded image, or the automatic icon (lib/category-icon.ts). */
export function CategoryBadge({ title, image, size = "md" }: { title: string; image?: string; size?: "sm" | "md" | "lg" }) {
  const box = size === "lg" ? "size-12 rounded-xl" : size === "sm" ? "size-7 rounded-lg" : "size-10 rounded-xl";
  const icon = size === "lg" ? "size-6" : size === "sm" ? "size-3.5" : "size-5";
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...fixedImage(image, size === "lg" ? 48 : size === "sm" ? 28 : 40)} alt="" loading="lazy" decoding="async" className={`${box} shrink-0 border border-line bg-surface object-contain`} />;
  }
  return (
    <span className={`${box} flex shrink-0 items-center justify-center bg-accent-soft text-accent`}>
      <Icon name={categoryIcon(title)} className={icon} />
    </span>
  );
}

/** Links that are docs pages with a card, in order. */
export function withCards(links: NavLink[], cards: Map<string, PageCard>) {
  return links.flatMap((link) => {
    const card = cards.get(link.href);
    return card ? [{ link, card }] : [];
  });
}

/** Popular hrefs first (when there are views), then the rest of `fallback`, without duplicates. */
export function popularFirst(popular: string[], fallback: string[], limit: number) {
  return [...new Set([...popular, ...fallback])].slice(0, limit);
}

/** Every category (section) of every tab, with its docs pages. Sections without pages are left out. */
export function categoriesOf(tabs: NavTab[]) {
  return tabs.flatMap((tab) =>
    tab.sections.flatMap((section) => {
      const pages = sectionPages(section);
      return pages.length ? [{ tab, section, pages }] : [];
    }),
  );
}

const ROMAN: [number, string][] = [
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];
export function roman(n: number) {
  let out = "";
  for (const [value, letters] of ROMAN) {
    while (n >= value) {
      out += letters;
      n -= value;
    }
  }
  return out;
}

export type BookEntry = {
  href: string;
  title: string;
  /** Part (tab) number, 1-based. */
  part: number;
  partTitle: string;
  /** Chapter (section) number, counted across the whole book. */
  chapter: number;
  chapterTitle: string;
  /** The chapter's navigation section id (a category), e.g. for its PDF. */
  sectionId?: string;
  /** Position within the chapter, 1-based: "3.2" is chapter 3, page 2. */
  index: number;
};

/** The navigation read as a book: tabs are parts, sections are numbered chapters, pages are numbered within them. */
export function bookOutline(tabs: NavTab[]): BookEntry[] {
  const entries: BookEntry[] = [];
  let chapter = 0;
  tabs.forEach((tab, t) => {
    for (const section of tab.sections) {
      const pages = sectionPages(section);
      if (!pages.length) continue;
      chapter += 1;
      pages.forEach((page, i) =>
        entries.push({ href: page.href, title: page.title, part: t + 1, partTitle: tab.title, chapter, chapterTitle: section.title, sectionId: section.id, index: i + 1 }),
      );
    }
  });
  return entries;
}
