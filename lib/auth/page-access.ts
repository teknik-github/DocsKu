import "server-only";
import { and, eq, inArray, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { can } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/auth/dal";

/**
 * Whether someone may change a page's working copy. Admins and editors may edit
 * every page; a contributor only pages they wrote (author) or that are
 * assigned to them (owner), and never the block-edited home page.
 */
export async function canEditPage(user: Pick<SessionUser, "id" | "role">, pageId: string): Promise<boolean> {
  if (can(user, "pages.editAny")) return true;
  const [page] = await db
    .select({ id: schema.pages.id })
    .from(schema.pages)
    .where(
      and(
        eq(schema.pages.id, pageId),
        eq(schema.pages.kind, "doc"),
        or(eq(schema.pages.authorId, user.id), eq(schema.pages.ownerId, user.id)),
      ),
    );
  return Boolean(page);
}

/** The subset of `pageIds` the user may edit (all of them for staff). */
export async function editablePageIds(user: Pick<SessionUser, "id" | "role">, pageIds: string[]): Promise<string[]> {
  if (!pageIds.length) return [];
  if (can(user, "pages.editAny")) return pageIds;
  const rows = await db
    .select({ id: schema.pages.id })
    .from(schema.pages)
    .where(
      and(
        inArray(schema.pages.id, pageIds),
        eq(schema.pages.kind, "doc"),
        or(eq(schema.pages.authorId, user.id), eq(schema.pages.ownerId, user.id)),
      ),
    );
  return rows.map((row) => row.id);
}

export const NO_PAGE_ACCESS = "Anda hanya bisa menyunting halaman Anda sendiri.";
