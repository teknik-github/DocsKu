import { revalidateTag } from "next/cache";
import { and, eq, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { addToNavigation, readAutomation } from "@/lib/automation";
import { authorizedInternal } from "@/lib/internal-auth";
import { forgetRedirects } from "@/lib/redirects";

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

  // Make the new pages visible right away rather than on the next background refresh.
  if (published.length) {
    revalidateTag("pages", { expire: 0 });
    forgetRedirects();
  }
  if (navigationChanged) revalidateTag("navigation", { expire: 0 });
  return Response.json({ published: published.length });
}
