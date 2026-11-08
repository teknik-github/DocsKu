import "server-only";
import { and, eq, gt, inArray, lt, ne, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * Who has a page open in the editor. Each editor tab sends a heartbeat about
 * every 20 s (`/admin/api/presence`); a row older than `FRESH_SECONDS` no
 * longer counts, and rows older than an hour are pruned on the way.
 */
export const FRESH_SECONDS = 60;
const fresh = () => gt(schema.pagePresence.lastSeen, sql`now() - make_interval(secs => ${FRESH_SECONDS})`);

export type PresencePerson = { userId: string; name: string; avatar: string | null; self: boolean };

export async function touchPresence(pageId: string, userId: string, tabId: string) {
  await db
    .insert(schema.pagePresence)
    .values({ pageId, userId, tabId })
    .onConflictDoUpdate({ target: [schema.pagePresence.pageId, schema.pagePresence.userId, schema.pagePresence.tabId], set: { lastSeen: sql`now()` } });
  // Cheap pruning: rows nobody has refreshed for an hour.
  if (Math.random() < 0.05) await db.delete(schema.pagePresence).where(lt(schema.pagePresence.lastSeen, sql`now() - interval '1 hour'`));
}

export async function leavePresence(pageId: string, userId: string, tabId: string) {
  await db
    .delete(schema.pagePresence)
    .where(and(eq(schema.pagePresence.pageId, pageId), eq(schema.pagePresence.userId, userId), eq(schema.pagePresence.tabId, tabId)));
}

/** Everyone else with the page open now: other people, and the same person in another tab (`self`). */
export async function othersOnPage(pageId: string, userId: string, tabId: string): Promise<PresencePerson[]> {
  const rows = await db
    .selectDistinctOn([schema.pagePresence.userId, schema.pagePresence.tabId], {
      userId: schema.pagePresence.userId,
      name: schema.users.name,
      avatar: schema.users.avatar,
    })
    .from(schema.pagePresence)
    .innerJoin(schema.users, eq(schema.users.id, schema.pagePresence.userId))
    .where(
      and(
        eq(schema.pagePresence.pageId, pageId),
        fresh(),
        or(ne(schema.pagePresence.userId, userId), ne(schema.pagePresence.tabId, tabId)),
      ),
    );
  const seen = new Set<string>();
  const people: PresencePerson[] = [];
  for (const row of rows) {
    const key = row.userId === userId ? `${row.userId}:self` : row.userId;
    if (seen.has(key)) continue;
    seen.add(key);
    people.push({ ...row, self: row.userId === userId });
  }
  return people;
}

/** Pages someone has open right now, for the Halaman list: page id → names (and photos). */
export async function presenceByPage(pageIds: string[]): Promise<Map<string, { name: string; avatar: string | null }[]>> {
  const map = new Map<string, { name: string; avatar: string | null }[]>();
  if (!pageIds.length) return map;
  const rows = await db
    .selectDistinctOn([schema.pagePresence.pageId, schema.pagePresence.userId], {
      pageId: schema.pagePresence.pageId,
      name: schema.users.name,
      avatar: schema.users.avatar,
    })
    .from(schema.pagePresence)
    .innerJoin(schema.users, eq(schema.users.id, schema.pagePresence.userId))
    .where(and(inArray(schema.pagePresence.pageId, pageIds), fresh()));
  for (const row of rows) map.set(row.pageId, [...(map.get(row.pageId) ?? []), { name: row.name, avatar: row.avatar }]);
  return map;
}
