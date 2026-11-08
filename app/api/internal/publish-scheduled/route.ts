import { revalidateTag } from "next/cache";
import { after } from "next/server";
import { and, eq, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { addToNavigation, readAutomation } from "@/lib/automation";
import { authorizedInternal } from "@/lib/internal-auth";
import { forgetRedirects } from "@/lib/redirects";
import { forgetRouteExistence } from "@/lib/route-exists";
import { logActivity, pruneActivity } from "@/lib/activity";
import { notify } from "@/lib/notify";
import { runNotifications } from "@/lib/notifications/deliver";
import { runWeeklyLinkCheck } from "@/lib/link-schedule";

/**
 * Publishes scheduled pages whose time has come. Called every minute by
 * instrumentation.ts; can also be hit by an external cron with the secret.
 */
export async function POST(request: Request) {
  if (!authorizedInternal(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const published = await db.transaction(async (tx) => {
    const due = await tx
      .update(schema.pages)
      .set({
        status: "published",
        title: sql`${schema.pages.draftTitle}`,
        description: sql`${schema.pages.draftDescription}`,
        content: sql`${schema.pages.draftContent}`,
        seo: sql`${schema.pages.draftSeo}`,
        coverImage: sql`${schema.pages.draftCoverImage}`,
        hasChanges: false,
        reviewedAt: sql`now()`,
      })
      .where(and(eq(schema.pages.status, "scheduled"), lte(schema.pages.publishedAt, sql`now()`)))
      .returning({
        id: schema.pages.id,
        title: schema.pages.title,
        description: schema.pages.description,
        content: schema.pages.content,
        seo: schema.pages.seo,
        coverImage: schema.pages.coverImage,
        kind: schema.pages.kind,
        navSection: schema.pages.navSection,
        slug: schema.pages.slug,
      });
    if (due.length) {
      await tx.insert(schema.pageRevisions).values(
        due.map((page) => ({
          pageId: page.id,
          title: page.title,
          description: page.description,
          content: page.content,
          seo: page.seo,
          coverImage: page.coverImage,
          reason: "publish",
        })),
      );
    }
    return due;
  });

  // First publish: list the pages in the section chosen when they were scheduled.
  let navigationChanged = false;
  if (published.length && (await readAutomation()).navigation) {
    for (const page of published) {
      if (page.kind === "doc" && (await addToNavigation(page.id, page.navSection))) navigationChanged = true;
    }
  }

  for (const page of published) {
    await logActivity({ user: null, action: "page.publish", target: { type: "page", id: page.id, label: page.kind === "home" ? "Beranda" : page.title }, meta: { scheduled: true } });
    // A scheduled page going live is a first publish (published pages can't be scheduled).
    if (page.kind === "doc") await notify({ type: "page.published", pageId: page.id, title: page.title, href: `/docs/${page.slug}`, by: "Jadwal terbit" });
  }
  await pruneActivity();

  // Make the new pages visible right away rather than on the next background refresh.
  if (published.length) {
    revalidateTag("pages", { expire: 0 });
    forgetRedirects();
    forgetRouteExistence();
  }
  if (navigationChanged) revalidateTag("navigation", { expire: 0 });
  // Emails and webhooks queued by notify() go out here, within a time budget.
  const notifications = await runNotifications();
  // The weekly link check can take minutes: it runs after this response.
  after(() => runWeeklyLinkCheck(new URL(request.url).searchParams.get("periksa-tautan") === "1"));
  return Response.json({ published: published.length, notifications });
}
