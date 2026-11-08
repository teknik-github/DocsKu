import "server-only";
import { db, schema } from "@/db";
import { logActivity } from "@/lib/activity";
import { checkExternalLinks } from "@/lib/link-check";
import { notify } from "@/lib/notify";
import { prefOn } from "@/lib/notifications/catalog";
import { claim, jakarta, readState } from "@/lib/notifications/deliver";
import { siteName, teamWithPrefs } from "@/lib/notifications/dispatch";
import { emailReady, readEmailSettings, siteOrigin } from "@/lib/notifications/settings";
import { renderEmail } from "@/lib/notifications/templates";
import { getReviewSettings, isRefusal, scanLinks, type LinkProblem } from "@/lib/review";
import { inArray } from "drizzle-orm";

/**
 * Weekly link check (Pengaturan → Tinjauan → "Periksa tautan setiap minggu"):
 * once per Asia/Jakarta week, from Monday 02:00, the scheduler re-checks every
 * external link (oldest first, in batches, at most CHECK_BUDGET_MS), then
 * emails each page's owner (or author) the broken links on their pages, admins
 * a summary of all of them, and sends `links.broken` to subscribed webhooks.
 * Runs after the scheduler's response (`after()`), never in a request's way.
 */

const CHECK_BUDGET_MS = 10 * 60 * 1000;

const PROBLEM: Record<LinkProblem["kind"], string> = {
  page: "halaman tidak ada",
  draft: "halaman belum terbit",
  internal: "alamat tidak valid",
  redirect: "lewat redirect",
  anchor: "judul bagian (#) tidak ada",
  media: "berkas media hilang",
  private: "halaman internal",
};

type BrokenPage = { pageId: string; title: string; links: { href: string; reason: string }[] };

/** Monday (YYYY-MM-DD, Asia/Jakarta) of the current week. */
function weekOf(now = new Date()) {
  const { day, weekday } = jakarta(now);
  const back = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(weekday);
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - Math.max(0, back));
  return date.toISOString().slice(0, 10);
}

/** Broken links per published page: internal problems (not redirects) and external links that failed. */
async function brokenByPage(): Promise<BrokenPage[]> {
  const { problems, external } = await scanLinks();
  const pages = new Map<string, BrokenPage>();
  const add = (pageId: string, title: string, href: string, reason: string) => {
    const page = pages.get(pageId) ?? { pageId, title, links: [] };
    page.links.push({ href, reason });
    pages.set(pageId, page);
  };
  for (const problem of problems) if (problem.kind !== "redirect") add(problem.pageId, problem.pageTitle, problem.href, PROBLEM[problem.kind]);
  for (const link of external) {
    if (link.ok !== false || isRefusal(link.status ?? 0)) continue;
    for (const page of link.pages) add(page.id, page.title, link.url, link.status ? `HTTP ${link.status}` : (link.error ?? "tidak bisa dibuka"));
  }
  return [...pages.values()].sort((a, b) => a.title.localeCompare(b.title, "id"));
}

/** One scheduler tick: runs the week's check if it is due. Never throws. */
export async function runWeeklyLinkCheck(force = false): Promise<{ ran: boolean; checked?: number; pages?: number }> {
  try {
    if (!force) {
      if ((await getReviewSettings()).autoLinkCheck === false) return { ran: false };
      const { weekday, hour } = jakarta();
      const week = weekOf();
      // From Monday 02:00 (or any later day of the week, if the server was down then).
      if (weekday === "Mon" && hour < 2) return { ran: false };
      if ((await readState()).linksWeek === week) return { ran: false };
      if (!(await claim("linksWeek", week))) return { ran: false };
    }

    const started = Date.now();
    let checked = 0;
    for (;;) {
      const { external } = await scanLinks();
      const stale = external.filter((link) => !link.checkedAt || Date.parse(link.checkedAt) < started);
      if (!stale.length || Date.now() - started > CHECK_BUDGET_MS) break;
      const result = await checkExternalLinks(
        stale.map((link) => link.url),
        new Map(stale.map((link) => [link.url, link.checkedAt ? Date.parse(link.checkedAt) : 0])),
      );
      if (result.busy || result.checked === 0) break;
      checked += result.checked;
    }

    const broken = await brokenByPage();
    await logActivity({ user: null, action: "links.check", meta: { checked, broken: broken.reduce((n, page) => n + page.links.length, 0), auto: true } });
    if (!broken.length) return { ran: true, checked, pages: 0 };

    const total = broken.reduce((n, page) => n + page.links.length, 0);
    await notify({ type: "links.broken", total, pages: broken.map((page) => ({ pageId: page.pageId, title: page.title, count: page.links.length })) });
    await emailOwners(broken, total);
    return { ran: true, checked, pages: broken.length };
  } catch (error) {
    console.error("[links] pemeriksaan mingguan gagal", error instanceof Error ? error.message : error);
    return { ran: false };
  }
}

/** One email per person: owners/authors get their pages, admins every page. */
async function emailOwners(broken: BrokenPage[], total: number) {
  const settings = await readEmailSettings();
  if (!emailReady(settings)) return;
  const [people, name, origin, owners] = await Promise.all([
    teamWithPrefs(),
    siteName(),
    siteOrigin(),
    db
      .select({ id: schema.pages.id, owner: schema.pages.ownerId, author: schema.pages.authorId, updatedBy: schema.pages.updatedById })
      .from(schema.pages)
      .where(inArray(schema.pages.id, broken.map((page) => page.pageId))),
  ]);
  const responsible = new Map(owners.map((row) => [row.id, row.owner ?? row.author ?? row.updatedBy]));
  for (const person of people) {
    if (!person.email || !prefOn(person.prefs, "links.broken")) continue;
    const mine = person.role === "admin" ? broken : broken.filter((page) => responsible.get(page.pageId) === person.id);
    if (!mine.length) continue;
    const count = mine.reduce((n, page) => n + page.links.length, 0);
    const content = renderEmail({
      siteName: name,
      subject: `[${name}] ${count} tautan rusak di ${mine.length} halaman`,
      heading: "Hasil pemeriksaan tautan minggu ini",
      lines: [
        person.role === "admin" && mine.length === broken.length
          ? `Ditemukan ${total} tautan rusak di ${broken.length} halaman.`
          : `Ditemukan ${count} tautan rusak di halaman yang Anda pegang.`,
      ],
      list: mine.slice(0, 20).map((page) => ({
        title: page.title,
        items: page.links.slice(0, 10).map((link) => ({ text: link.href, meta: link.reason, url: `${origin}/admin/pages/${page.pageId}` })),
      })),
      action: { label: "Buka Tinjauan → Tautan rusak", url: `${origin}/admin/review?tab=tautan` },
    });
    await db.insert(schema.emailOutbox).values({ to: person.email, subject: content.subject, text: content.text, html: content.html, event: "links.broken" });
  }
}
