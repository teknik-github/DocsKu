import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export type OpenNote = { id: string; pageId: string; pageTitle: string; body: string; quote: string; author: string; createdAt: string; replies: number };

/**
 * Open (unresolved) top-level internal notes that concern someone: on pages
 * they wrote or own, or in conversations they took part in, newest activity
 * first. For the dashboard's "Catatan tim terbuka".
 */
export async function listOpenNotesFor(userId: string, limit = 5): Promise<{ notes: OpenNote[]; total: number }> {
  const relevant = sql`
    n.parent_id is null and n.resolved_at is null and (
      coalesce(p.author_id, p.updated_by_id) = ${userId} or p.owner_id = ${userId}
      or exists (select 1 from page_notes m where (m.id = n.id or m.parent_id = n.id) and m.author_id = ${userId})
    )`;
  const [rows, [total]] = await Promise.all([
    db.execute<OpenNote>(sql`
      select n.id, n.page_id as "pageId", coalesce(nullif(p.draft_title, ''), 'Tanpa judul') as "pageTitle", n.body, n.quote,
        coalesce(u.name, 'Pengguna terhapus') as author,
        to_char(greatest(n.created_at, coalesce((select max(r.created_at) from page_notes r where r.parent_id = n.id), n.created_at)) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt",
        (select count(*)::int from page_notes r where r.parent_id = n.id) as replies
      from page_notes n join pages p on p.id = n.page_id left join users u on u.id = n.author_id
      where ${relevant}
      order by "createdAt" desc
      limit ${limit}`),
    db.execute<{ n: number }>(sql`select count(*)::int as n from page_notes n join pages p on p.id = n.page_id where ${relevant}`),
  ]);
  return { notes: [...rows], total: total?.n ?? 0 };
}
