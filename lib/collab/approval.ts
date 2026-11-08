import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

/** What the editor shows about a page's approval request (null when there is none). */
export type ApprovalInfo = {
  status: "pending" | "changes_requested";
  note: string | null;
  requestedBy: string | null;
  requestedById: string | null;
  requestedAt: string | null;
} | null;

export async function getApprovalInfo(pageId: string): Promise<ApprovalInfo> {
  const [row] = await db
    .select({
      status: schema.pages.approvalStatus,
      note: schema.pages.approvalNote,
      requestedById: schema.pages.approvalRequestedById,
      requestedAt: schema.pages.approvalRequestedAt,
      requestedBy: schema.users.name,
    })
    .from(schema.pages)
    .leftJoin(schema.users, eq(schema.users.id, schema.pages.approvalRequestedById))
    .where(eq(schema.pages.id, pageId));
  if (!row || (row.status !== "pending" && row.status !== "changes_requested")) return null;
  return { status: row.status, note: row.note, requestedBy: row.requestedBy, requestedById: row.requestedById, requestedAt: row.requestedAt?.toISOString() ?? null };
}
