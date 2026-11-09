import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { can } from "@/lib/auth/permissions";
import { editablePageIds } from "@/lib/auth/page-access";
import { pageQuality } from "@/lib/data/admin";
import { dueAtSql, isRefusal, scanLinks } from "@/lib/review";
import type { Role } from "@/db/schema";

/**
 * `audit_pages` for AI Chat: published doc pages that need work, with the
 * numbers behind it, so the agent can report findings and propose fixes.
 * Contributors only see pages they may edit.
 */

export const AUDIT_FOCUS = ["all", "review_due", "low_quality", "broken_links", "stale"] as const;
export type AuditFocus = (typeof AUDIT_FOCUS)[number];

type Finding = {
  slug: string;
  title: string;
  daysSinceUpdate: number;
  reviewOverdueDays?: number;
  quality?: { score: number; issues: string[] };
  brokenLinks?: { href: string; reason: string }[];
};

const REASON: Record<string, string> = {
  page: "halaman tidak ada",
  draft: "halaman belum terbit",
  internal: "alamat tidak valid",
  anchor: "judul bagian (#) tidak ada",
  media: "berkas media hilang",
  private: "menautkan halaman internal",
};

export async function auditPages(user: { id: string; role: Role }, focus: AuditFocus, limit = 12): Promise<Finding[]> {
  const rows = await db.execute<{ id: string; slug: string; title: string; days: number; overdue: number | null }>(sql`
    select p.id, p.slug, p.title, floor(extract(epoch from (now() - p.updated_at)) / 86400)::int as days,
      case when ${dueAtSql} < now() then floor(extract(epoch from (now() - ${dueAtSql})) / 86400)::int end as overdue
    from pages p
    where p.kind = 'doc' and p.status = 'published' and p.translation_of is null`);
  let pages = [...rows];
  if (!can(user, "pages.editAny")) {
    const allowed = new Set(await editablePageIds(user, pages.map((page) => page.id)));
    pages = pages.filter((page) => allowed.has(page.id));
  }
  if (!pages.length) return [];

  const needsLinks = focus === "all" || focus === "broken_links";
  const needsQuality = focus === "all" || focus === "low_quality";
  const [quality, links] = await Promise.all([
    needsQuality ? pageQuality(pages.map((page) => page.id)) : Promise.resolve(new Map()),
    needsLinks ? scanLinks() : Promise.resolve(null),
  ]);
  const broken = new Map<string, { href: string; reason: string }[]>();
  if (links) {
    for (const problem of links.problems) {
      if (problem.kind === "redirect") continue;
      broken.set(problem.pageId, [...(broken.get(problem.pageId) ?? []), { href: problem.href, reason: REASON[problem.kind] ?? problem.kind }]);
    }
    for (const link of links.external) {
      if (link.ok !== false || isRefusal(link.status)) continue;
      for (const page of link.pages) broken.set(page.id, [...(broken.get(page.id) ?? []), { href: link.url, reason: link.status ? `HTTP ${link.status}` : "tidak bisa dibuka" }]);
    }
  }

  const findings = pages.map((page) => {
    const q = quality.get(page.id) as { score: number; issues: string[] } | undefined;
    const finding: Finding = { slug: page.slug, title: page.title, daysSinceUpdate: page.days };
    if (page.overdue !== null) finding.reviewOverdueDays = page.overdue;
    if (q && q.score < 85) finding.quality = { score: q.score, issues: q.issues.slice(0, 5) };
    const pageLinks = broken.get(page.id);
    if (pageLinks?.length) finding.brokenLinks = pageLinks.slice(0, 8);
    // Higher is worse: broken links, then overdue review, then a low score, then age.
    const severity =
      (pageLinks?.length ?? 0) * 30 + (page.overdue !== null ? 40 + Math.min(page.overdue, 365) / 10 : 0) + (q && q.score < 85 ? 100 - q.score : 0) + Math.min(page.days, 730) / 30;
    return { finding, severity, page, q };
  });

  const chosen =
    focus === "review_due"
      ? findings.filter((f) => f.page.overdue !== null).sort((a, b) => (b.page.overdue ?? 0) - (a.page.overdue ?? 0))
      : focus === "low_quality"
        ? findings.filter((f) => f.q && f.q.score < 85).sort((a, b) => (a.q?.score ?? 100) - (b.q?.score ?? 100))
        : focus === "broken_links"
          ? findings.filter((f) => f.finding.brokenLinks).sort((a, b) => (b.finding.brokenLinks?.length ?? 0) - (a.finding.brokenLinks?.length ?? 0))
          : focus === "stale"
            ? [...findings].sort((a, b) => b.page.days - a.page.days)
            : findings.filter((f) => f.severity > 5).sort((a, b) => b.severity - a.severity);
  return chosen.slice(0, Math.min(Math.max(limit, 1), 25)).map((f) => f.finding);
}
