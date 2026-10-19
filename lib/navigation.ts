import type { NavItem, NavLink, NavSection, NavTab } from "@/lib/site-types";

export function isGroup(item: NavItem): item is Extract<NavItem, { items: NavItem[] }> {
  return "items" in item;
}

function flattenItems(items: NavItem[], section: string): (NavLink & { section: string })[] {
  return items.flatMap((item) =>
    isGroup(item) ? flattenItems(item.items, section) : [{ ...item, section }],
  );
}

/** Docs pages of a tab in sidebar order (external links excluded). */
export function tabPages(tab: NavTab) {
  return tab.sections
    .flatMap((section) => flattenItems(section.items, section.title))
    .filter((page) => page.href.startsWith("/docs/"));
}

export function allPages(tabs: NavTab[]) {
  return tabs.flatMap((tab) => tabPages(tab).map((page) => ({ ...page, tab: tab.title })));
}

export function findTab(tabs: NavTab[], pathname: string): NavTab | undefined {
  return tabs.find((tab) => tabPages(tab).some((page) => page.href === pathname));
}

export function findPage(tabs: NavTab[], pathname: string) {
  return allPages(tabs).find((page) => page.href === pathname);
}

/** Previous/next pages within the same tab. */
export function getPager(tabs: NavTab[], pathname: string) {
  const tab = findTab(tabs, pathname);
  if (!tab) return { prev: undefined, next: undefined };
  const pages = tabPages(tab);
  const index = pages.findIndex((page) => page.href === pathname);
  return { prev: pages[index - 1], next: pages[index + 1] };
}

export function groupContains(item: NavItem, pathname: string): boolean {
  return isGroup(item)
    ? item.items.some((child) => groupContains(child, pathname))
    : item.href === pathname;
}

export const slugToHref = (slug: string) => `/docs/${slug}`;

function sectionLinks(items: NavItem[]): NavLink[] {
  return items.flatMap((item) => (isGroup(item) ? sectionLinks(item.items) : [item])).filter((l) => l.href.startsWith("/docs/"));
}

/** Where a page sits: its tab, its section, and the other pages of that section. */
export function locate(tabs: NavTab[], pathname: string) {
  for (const tab of tabs) {
    for (const section of tab.sections) {
      const pages = sectionLinks(section.items);
      if (pages.some((page) => page.href === pathname)) return { tab, section, pages };
    }
  }
  return null;
}

/** Every docs link of a section, groups flattened, in sidebar order. */
export const sectionPages = (section: NavSection) => sectionLinks(section.items);

/** URL slug for a tab title, used by the Ghost layout's ?topik= filter. */
export const topicSlug = (title: string) =>
  title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
