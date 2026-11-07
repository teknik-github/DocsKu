import "server-only";
import type { NavItemData, NavigationData } from "@/lib/site-types";

/**
 * Categories in the dashboard (Halaman) are the navigation's sections, grouped
 * by tab, so the help-centre home, the sidebar and the page list share one
 * structure. Pages belong to the section that lists them; a page that isn't
 * listed yet but has `navSection` set will be added there when it's published.
 */

export type Category = { id: string; title: string; image?: string };
export type CategoryGroup = { id: string; title: string; categories: Category[] };

export function categoryGroups(navigation: NavigationData): CategoryGroup[] {
  return navigation.tabs.map((tab) => ({
    id: tab.id,
    title: tab.title,
    categories: tab.sections.map((section) => ({ id: section.id, title: section.title, image: section.image })),
  }));
}

function pageIds(items: NavItemData[]): string[] {
  return items.flatMap((item) => (item.type === "page" ? [item.pageId] : item.type === "group" ? pageIds(item.items) : []));
}

/** Page id → the section listing it (the first, if listed twice). */
export function listedIn(navigation: NavigationData): Map<string, string> {
  const map = new Map<string, string>();
  for (const tab of navigation.tabs) {
    for (const section of tab.sections) for (const id of pageIds(section.items)) if (!map.has(id)) map.set(id, section.id);
  }
  return map;
}

function withoutPages(items: NavItemData[], ids: Set<string>): NavItemData[] {
  return items.flatMap((item): NavItemData[] => {
    if (item.type === "page") return ids.has(item.pageId) ? [] : [item];
    if (item.type === "group") return [{ ...item, items: withoutPages(item.items, ids) }];
    return [item];
  });
}

/** Takes the pages out of every section, then appends them to `sectionId` (or nowhere when null). */
export function placePages(navigation: NavigationData, ids: string[], sectionId: string | null): NavigationData {
  const set = new Set(ids);
  return {
    tabs: navigation.tabs.map((tab) => ({
      ...tab,
      sections: tab.sections.map((section) => {
        const items = withoutPages(section.items, set);
        return section.id === sectionId ? { ...section, items: [...items, ...ids.map((pageId) => ({ type: "page" as const, pageId }))] } : { ...section, items };
      }),
    })),
  };
}

export function findCategory(navigation: NavigationData, sectionId: string) {
  for (const tab of navigation.tabs) {
    const section = tab.sections.find((s) => s.id === sectionId);
    if (section) return { tab, section };
  }
  return null;
}

/** A category image: an upload (/media/…) or an https URL. */
export const isCategoryImage = (value: string) => /^(\/media\/[\w.-]+|https:\/\/\S+)$/i.test(value);
