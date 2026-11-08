/**
 * Shapes of the "site" and "navigation" settings stored in the database, and
 * the resolved navigation the public site renders. Safe to import anywhere.
 */

export type ExternalLink = { title: string; href: string; description?: string };

/**
 * How /docs is presented: "docs" (sidebar + table of contents), "hybrid",
 * "ghost", and the others listed in lib/docs-layouts.ts.
 */
import type { DocsLayout } from "@/lib/docs-layouts";
export type { DocsLayout };

export type SiteSettings = {
  layout?: DocsLayout;
  /** Colour theme id from lib/color-themes.ts (default "terakota"). Set in Tema. */
  colorTheme?: string;
  /** Author byline, author box and /penulis pages (default on). Set in Tema → Penulis. */
  showAuthors?: boolean;
  /** "Unduh PDF" buttons and /pdf/… downloads (default on). Set in Tema → PDF. */
  pdfDownloads?: boolean;
  name: string;
  description: string;
  headerCta: { title: string; href: string } | null;
  resources: ExternalLink[];
  footer: { title: string; links: ExternalLink[] }[];
  /**
   * Per extra language (code → overrides, Pengaturan → Umum): the site
   * description, header button and footer columns readers of that language see.
   * A missing field falls back to the default language's.
   */
  localized?: Record<string, LocalizedSite>;
};

export type LocalizedSite = {
  description?: string;
  headerCta?: { title: string; href: string } | null;
  footer?: { title: string; links: ExternalLink[] }[];
};

/** The site settings as readers of `locale` see them (description, header button, footer). */
export function siteForLocale(site: SiteSettings, locale: string | undefined): SiteSettings {
  const own = locale ? site.localized?.[locale] : undefined;
  if (!own) return site;
  return {
    ...site,
    description: own.description || site.description,
    headerCta: own.headerCta !== undefined ? own.headerCta : site.headerCta,
    footer: own.footer ?? site.footer,
  };
}

// ---- Stored navigation (edited in the dashboard) ----

export type NavItemData =
  | { type: "page"; pageId: string; title?: string }
  | { type: "link"; title: string; href: string }
  | { type: "group"; title: string; items: NavItemData[] };

/** A section is also a category in Halaman and on the help-centre home; `image` replaces its automatic icon there. */
/** `titles`: the title in other languages, by language code (Pengaturan → Bahasa). */
export type NavSectionData = { id: string; title: string; titles?: Record<string, string>; image?: string; items: NavItemData[] };
export type NavTabData = { id: string; title: string; titles?: Record<string, string>; sections: NavSectionData[] };
export type NavigationData = { tabs: NavTabData[] };

// ---- Resolved navigation (only published pages, with hrefs) ----

export type NavLink = { title: string; href: string };
export type NavGroup = { title: string; items: NavItem[] };
export type NavItem = NavLink | NavGroup;
/** `id` is the stored section id (a category), e.g. for /pdf/kategori/<id>. */
export type NavSection = { id?: string; title: string; image?: string; items: NavItem[] };
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

/** One glossary entry: the term, other spellings that mean it, and a short plain-text definition. */
export type GlossaryTerm = {
  id: string;
  term: string;
  aliases: string[];
  definition: string;
};

/** Glossary (settings key "glossary"): the public /glosarium page and, with `tooltips`, definitions on the first use of a term in articles. */
export type GlossarySettings = {
  terms: GlossaryTerm[];
  tooltips: boolean;
};

/** Public comments under docs pages (settings key "comments"). */
export type CommentSettings = {
  /** Show the comment section and accept new comments. */
  enabled: boolean;
  /** New comments from visitors wait for approval in the dashboard (off: shown at once, except ones with links). */
  moderation: boolean;
  /** Readers can select a passage and mark it as confusing; it becomes an internal note (default on). */
  sectionFeedback?: boolean;
};

/** Periodic content review (settings key "review"); pages can override the interval. */
export type ReviewSettings = {
  enabled: boolean;
  /** Days after the last review (or publish) before a page is due again; 0 = pages without their own interval are never due. */
  defaultIntervalDays: number;
  /** Check external links every week and email the owners of pages with broken links (default on). */
  autoLinkCheck?: boolean;
};

/** "Tanya AI" in the public search box (settings key "ask_ai"). Works only while AI is set up. */
export type AskAiSettings = {
  enabled: boolean;
  /** Questions per visitor (IP, behind TRUST_PROXY) per minute. */
  perMinute: number;
  /** Questions per day for the whole site (Asia/Jakarta); then search falls back to plain results. */
  dailyLimit: number;
};

/**
 * The embeddable help widget (settings key "widget"): other sites add
 * `<script src="…/widget.js">` and get a launcher that opens /widget in a frame.
 */
export type WidgetSettings = {
  enabled: boolean;
  /** Origins allowed to embed it ("https://app.example.com", "https://*.example.com"); empty = nobody. */
  allowedOrigins: string[];
  /** Launcher button text. */
  label: string;
  position: "right" | "left";
  /** Launcher colour (#rrggbb); null = the colour theme's accent. */
  accent: string | null;
  /** First line inside the widget. */
  greeting: string;
  /** Offer Tanya AI there too (only while Tanya AI itself is available). */
  ai: boolean;
};

/** A link button on the home page. */
export type HomeButton = { label: string; href: string; style: "primary" | "secondary" };

type SectionBase = {
  id: string;
  /** Hidden sections stay in the builder but are not shown. */
  hidden: boolean;
  /** Two "half" sections in a row sit side by side on wide screens. */
  width: "full" | "half";
  /** Background band of a full-width section. */
  tone: "plain" | "muted" | "accent";
};

export type HomeSection = SectionBase &
  (
    | {
        type: "hero";
        eyebrow: string;
        title: string;
        subtitle: string;
        showSearch: boolean;
        searchLabel: string;
        showPopular: boolean;
        image: string | null;
        align: "center" | "left";
        buttons: HomeButton[];
      }
    | { type: "categories"; title: string; columns: 2 | 3 | 4; links: number; groupByTab: boolean }
    | { type: "articles"; title: string; source: "popular" | "latest" | "featured" | "manual"; pages: string[]; limit: number; style: "list" | "cards" }
    | { type: "features"; title: string; subtitle: string; columns: 2 | 3 | 4; items: { icon: string; image: string | null; title: string; text: string; href: string }[] }
    | { type: "textImage"; title: string; text: string; image: string | null; imageSide: "left" | "right"; buttons: HomeButton[] }
    | { type: "faq"; title: string; items: { question: string; answer: string }[] }
    | { type: "stats"; title: string; items: { value: string; label: string }[] }
    | { type: "cta"; title: string; text: string; buttons: HomeButton[] }
    | { type: "content"; markdown: string }
  );

export type HomeSectionType = HomeSection["type"];

/**
 * The public home (settings key "home", built at /admin/home): an ordered list of
 * sections. The builder edits "home_draft" and publishing copies it here.
 */
export type HomeSettings = { sections: HomeSection[] };
