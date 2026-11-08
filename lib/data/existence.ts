import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { and, eq } from "drizzle-orm";
import { buildingWithoutDatabase, db, schema } from "@/db";

/**
 * Existence checks that run before a page starts streaming, so a missing page
 * gets a real HTTP 404 (once a Suspense fallback is sent the status is fixed
 * at 200). They are user-independent and cached; whether the visitor may read
 * an internal page is decided separately, from the session.
 */

/** Whether a published internal doc page owns this slug. */
export async function internalSlugExists(slug: string): Promise<boolean> {
  "use cache";
  cacheTag("pages");
  cacheLife("max");
  if (buildingWithoutDatabase) return false;
  const [row] = await db
    .select({ id: schema.pages.id })
    .from(schema.pages)
    .where(and(eq(schema.pages.slug, slug), eq(schema.pages.status, "published"), eq(schema.pages.kind, "doc"), eq(schema.pages.visibility, "internal")));
  return Boolean(row);
}
