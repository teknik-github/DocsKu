import "server-only";
import { existsSync } from "node:fs";
import { eq, sql, type SQL } from "drizzle-orm";
import type { JSONContent } from "@tiptap/core";
import { db, schema } from "@/db";
import { headingIds, isExternalHref, safeHref, textOf, walk } from "@/lib/content/doc";
import { STORED_NAME, uploadPath } from "@/lib/media";
import type { ReviewSettings } from "@/lib/site-types";

/**
 * Content review (Tinjauan, /admin/review): published doc pages are due for a
 * check after an interval (per page, or the site default in settings key
 * "review"), counted from the last review or publish. Publishing counts as a
 * review. The same page also lists broken links found in published content.
 * Dashboard only: callers check auth.
 */

export const DEFAULT_REVIEW: ReviewSettings = { enabled: true, defaultIntervalDays: 180, autoLinkCheck: true };
/** Intervals offered in the editor; null = site default, 0 = never. */
export const REVIEW_INTERVALS = [30, 90, 180, 365] as const;
/** "Segera": due within this many days. */
export const SOON_DAYS = 14;

export async function getReviewSettings(): Promise<ReviewSettings> {
  const [row] = await db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, "review"));
  return { ...DEFAULT_REVIEW, ...(row?.value as Partial<ReviewSettings> | undefined) };
}

/**
 * When page `p` is next due, as SQL (null when it never is). Reads the settings
 * row itself, so it can be used in any query on `pages p`.
 */
export const dueAtSql: SQL = sql`(
  case when coalesce((select (value->>'enabled')::boolean from settings where key = 'review'), true)
    and coalesce(p.review_interval_days, (select (value->>'defaultIntervalDays')::int from settings where key = 'review'), ${DEFAULT_REVIEW.defaultIntervalDays}) > 0
  then coalesce(p.reviewed_at, p.published_at, p.created_at)
    + make_interval(days => coalesce(p.review_interval_days, (select (value->>'defaultIntervalDays')::int from settings where key = 'review'), ${DEFAULT_REVIEW.defaultIntervalDays}))
  end)`;

/** Published doc pages past their review date (the sidebar badge and the dashboard). */
export async function countOverdueReviews(): Promise<number> {
  const [row] = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from pages p
    where p.kind = 'doc' and p.status = 'published' and ${dueAtSql} < now()`);
  return row?.n ?? 0;
}

export type ReviewRow = {
  id: string;
  title: string;
  slug: string;
  visibility: string;
  ownerId: string | null;
  /** The owner, or the author when nobody owns the page. */
  ownerName: string | null;
  ownerIsAuthor: boolean;
  reviewedAt: string | null;
  publishedAt: string | null;
  dueAt: string;
  /** Whole days until due (negative: overdue). */
  days: number;
};

/** Pages overdue or due within SOON_DAYS, most overdue first. `mine` keeps pages the user owns (or wrote, when unowned). */
export async function listReviewPages({ userId, mine }: { userId: string; mine: boolean }): Promise<ReviewRow[]> {
  const rows = await db.execute<{
    id: string;
    title: string;
    slug: string;
    visibility: string;
    owner_id: string | null;
    owner_name: string | null;
    author_name: string | null;
    reviewed_at: Date | string | null;
    published_at: Date | string | null;
    due_at: Date | string;
    days: number;
  }>(sql`
    select * from (
      select p.id, p.title, p.slug, p.visibility::text as visibility, p.owner_id, o.name as owner_name, a.name as author_name,
        p.reviewed_at, p.published_at, ${dueAtSql} as due_at, p.author_id
      from pages p
      left join users o on o.id = p.owner_id
      left join users a on a.id = p.author_id
      where p.kind = 'doc' and p.status = 'published'
    ) x
    cross join lateral (select floor(extract(epoch from (x.due_at - now())) / 86400)::int as days) d
    where x.due_at is not null and x.due_at < now() + make_interval(days => ${SOON_DAYS})
      ${mine ? sql`and (x.owner_id = ${userId} or (x.owner_id is null and x.author_id = ${userId}))` : sql``}
    order by x.due_at asc
    limit 500`);
  const iso = (v: Date | string | null) => (v ? new Date(v).toISOString() : null);
  return [...rows].map((r) => ({
    id: r.id,
    title: r.title,
    slug: r.slug,
    visibility: r.visibility,
    ownerId: r.owner_id,
    ownerName: r.owner_name ?? r.author_name,
    ownerIsAuthor: !r.owner_name && !!r.author_name,
    reviewedAt: iso(r.reviewed_at),
    publishedAt: iso(r.published_at),
    dueAt: iso(r.due_at)!,
    days: r.days,
  }));
}

/* ---------------------------------------------------------------- links -- */

export type LinkProblem = {
  pageId: string;
  pageTitle: string;
  href: string;
  /** Link text or image alt, to find it in the editor. */
  label: string;
  kind: "page" | "draft" | "internal" | "redirect" | "anchor" | "media" | "private";
};

export type ExternalLinkState = {
  url: string;
  pages: { id: string; title: string }[];
  /** null: never checked. */
  ok: boolean | null;
  status: number | null;
  error: string | null;
  checkedAt: string | null;
};

type FoundLink = { href: string; label: string; image: boolean };

/** Every link and image in a document: link marks, card/button hrefs, image sources. */
export function linksOf(doc: JSONContent): FoundLink[] {
  const found: FoundLink[] = [];
  walk(doc, (node) => {
    const attrs = (node.attrs ?? {}) as Record<string, unknown>;
    if (typeof attrs.href === "string" && attrs.href.trim()) found.push({ href: attrs.href.trim(), label: String(attrs.title ?? textOf(node)).slice(0, 80), image: false });
    if (node.type === "image" && typeof attrs.src === "string") found.push({ href: attrs.src.trim(), label: String(attrs.alt || "gambar").slice(0, 80), image: true });
    for (const value of Object.values(attrs)) {
      if (!Array.isArray(value)) continue;
      for (const item of value) {
        if (item && typeof item === "object" && typeof (item as { href?: unknown }).href === "string") {
          const button = item as { href: string; label?: string };
          found.push({ href: button.href.trim(), label: String(button.label ?? "tombol").slice(0, 80), image: false });
        }
      }
    }
    for (const mark of node.marks ?? []) {
      if (mark.type === "link" && typeof mark.attrs?.href === "string") found.push({ href: mark.attrs.href.trim(), label: (node.text ?? "").slice(0, 80), image: false });
    }
  });
  return found;
}

/** The site's own origin from SITE_URL, so absolute links to it are checked as internal ones. */
function ownOrigin() {
  try {
    return process.env.SITE_URL ? new URL(process.env.SITE_URL).origin : null;
  } catch {
    return null;
  }
}

/**
 * Scans the live content of published doc pages. Internal problems: links to
 * /docs pages that aren't published (or only reachable through a redirect),
 * #anchors without a matching heading, and /media files that are gone.
 * External http(s) links are returned with their last check from `link_checks`.
 */
export async function scanLinks(): Promise<{ problems: LinkProblem[]; external: ExternalLinkState[]; scanned: number }> {
  const [pages, redirects, media, checks] = await Promise.all([
    db
      .select({ id: schema.pages.id, slug: schema.pages.slug, title: schema.pages.title, status: schema.pages.status, kind: schema.pages.kind, visibility: schema.pages.visibility, content: schema.pages.content })
      .from(schema.pages),
    db.select({ fromPath: schema.redirects.fromPath }).from(schema.redirects),
    db.select({ filename: schema.media.filename }).from(schema.media),
    db.select().from(schema.linkChecks),
  ]);
  const bySlug = new Map(pages.filter((p) => p.kind === "doc").map((p) => [p.slug, p]));
  const anchors = new Map<string, Set<string>>();
  const anchorsOf = (page: (typeof pages)[number]) => {
    let ids = anchors.get(page.id);
    if (!ids) anchors.set(page.id, (ids = new Set([...headingIds(page.content), "komentar"])));
    return ids;
  };
  const redirected = new Set(redirects.map((r) => r.fromPath));
  const mediaFiles = new Set(media.map((m) => m.filename));
  const checked = new Map(checks.map((c) => [c.url, c]));
  const origin = ownOrigin();

  const problems: LinkProblem[] = [];
  const external = new Map<string, ExternalLinkState>();
  const live = pages.filter((p) => p.kind === "doc" && p.status === "published");

  for (const page of live) {
    for (const link of linksOf(page.content)) {
      let href = safeHref(link.href) ?? link.href;
      if (/^mailto:/i.test(href)) continue;
      if (origin && href.startsWith(origin + "/")) href = href.slice(origin.length);
      const problem = (kind: LinkProblem["kind"]) => problems.push({ pageId: page.id, pageTitle: page.title, href: link.href, label: link.label, kind });

      if (isExternalHref(href)) {
        let url: string;
        try {
          url = new URL(href).toString();
        } catch {
          problem("internal");
          continue;
        }
        const entry = external.get(url) ?? { url, pages: [], ok: null, status: null, error: null, checkedAt: null };
        if (!entry.pages.some((p) => p.id === page.id)) entry.pages.push({ id: page.id, title: page.title });
        const check = checked.get(url);
        if (check) Object.assign(entry, { ok: check.ok, status: check.status, error: check.error, checkedAt: check.checkedAt.toISOString() });
        external.set(url, entry);
        continue;
      }

      if (href.startsWith("#")) {
        const id = decodeURIComponent(href.slice(1));
        if (id && !anchorsOf(page).has(id)) problem("anchor");
        continue;
      }

      if (href.startsWith("/media/")) {
        const file = decodeURIComponent(href.slice("/media/".length).split(/[?#]/)[0]);
        if (!STORED_NAME.test(file) || !mediaFiles.has(file) || !existsSync(uploadPath(file))) problem("media");
        continue;
      }

      if (href === "/docs" || href.startsWith("/docs/") || href.startsWith("/docs#") || href.startsWith("/docs?")) {
        const [path, hash] = href.split("#");
        const slug = decodeURIComponent(path.replace(/^\/docs\/?/, "").split("?")[0]).replace(/\/+$/, "");
        if (!slug) continue;
        const target = bySlug.get(slug);
        if (!target || target.status !== "published") {
          if (redirected.has(slug)) problem("redirect");
          else problem(target ? "draft" : "page");
          continue;
        }
        if (target.visibility === "internal" && page.visibility !== "internal") problem("private");
        else if (hash && !anchorsOf(target).has(decodeURIComponent(hash))) problem("anchor");
        continue;
      }
      // Other site paths ("/", "/admin…", "/cover…") aren't checked.
      if (!href.startsWith("/")) problem("internal");
    }
  }
  return { problems, external: [...external.values()], scanned: live.length };
}

/* ------------------------------------------------------------ external -- */

/** A failed check worth showing as broken: 401/403/429 usually mean the site refuses bots, not a dead link. */
export const isRefusal = (status: number | null) => status === 401 || status === 403 || status === 429 || status === 999;

/** Internal link problems in published content (redirected links not counted), for the dashboard. */
export async function countBrokenLinks(): Promise<number> {
  const { problems } = await scanLinks();
  return problems.filter((p) => p.kind !== "redirect").length;
}
