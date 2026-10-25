/**
 * Shapes of the "site" and "navigation" settings stored in the database, and
 * the resolved navigation the public site renders. Safe to import anywhere.
 */

export type ExternalLink = { title: string; href: string; description?: string };

/**
 * How /docs is presented: "docs" (sidebar + table of contents), "hybrid"
 * (card hub, centred articles with breadcrumb and section menu), or "ghost"
 * (blog style like demo.ghost.io: hero, filter chips, one card grid).
 */
export type DocsLayout = "docs" | "hybrid" | "ghost";

export type SiteSettings = {
  layout?: DocsLayout;
  name: string;
  description: string;
  headerCta: { title: string; href: string } | null;
  resources: ExternalLink[];
  footer: { title: string; links: ExternalLink[] }[];
};

// ---- Stored navigation (edited in the dashboard) ----

export type NavItemData =
  | { type: "page"; pageId: string; title?: string }
  | { type: "link"; title: string; href: string }
  | { type: "group"; title: string; items: NavItemData[] };

export type NavSectionData = { id: string; title: string; items: NavItemData[] };
export type NavTabData = { id: string; title: string; sections: NavSectionData[] };
export type NavigationData = { tabs: NavTabData[] };

// ---- Resolved navigation (only published pages, with hrefs) ----

export type NavLink = { title: string; href: string };
export type NavGroup = { title: string; items: NavItem[] };
export type NavItem = NavLink | NavGroup;
export type NavSection = { title: string; items: NavItem[] };
export type NavTab = { title: string; href: string; sections: NavSection[] };

export type SearchHeading = { id: string; text: string; level: 2 | 3 };
export type SearchEntry = {
  href: string;
  title: string;
  description: string;
  section: string;
  tab: string;
  headings: SearchHeading[];
};

/** Per-page search and social settings. Empty fields fall back to the page title/description. */
export type PageSeo = {
  title?: string;
  description?: string;
  /** Open Graph / social preview image URL. */
  image?: string;
  noindex?: boolean;
};

/** Shapes of the generated cover (app/cover/[...slug]/route.tsx). */
export type CoverShape = "card" | "wide" | "og";

/** A published docs page as shown on cards in the hybrid and Ghost layouts. */
export type PageCard = {
  href: string;
  title: string;
  description: string;
  cover: string | null;
  readingMinutes: number;
  publishedAt: string | null;
  featured: boolean;
};

/**
 * What happens on its own when a page is published (settings key "automation").
 * AI steps run only when AI is configured and quietly do nothing if it fails.
 */
export type AutomationSettings = {
  /** Add the page to the navigation on its first publish. */
  navigation: boolean;
  /** Replace a placeholder slug ("tanpa-judul…") with one from the title. */
  slug: boolean;
  /** Write a missing page description with AI. */
  description: boolean;
  /** Write a missing meta title/description with AI. */
  seo: boolean;
  /** Generate a cover (gradient with the title) for pages without one. */
  cover: boolean;
  /** Generated cover colour: a preset id, "mixed", or "#rrggbb" (lib/cover-palette.ts). */
  coverColor: string;
};

/** Public comments under docs pages (settings key "comments"). */
export type CommentSettings = {
  /** Show the comment section and accept new comments. */
  enabled: boolean;
  /** New comments from visitors wait for approval in the dashboard (off: shown at once, except ones with links). */
  moderation: boolean;
};
