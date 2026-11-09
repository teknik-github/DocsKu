import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * The activity log (/admin/activity): who did what in the dashboard or
 * through MCP. Call `logActivity` after a change has succeeded. It never
 * throws: a failed log write is reported to the server log and the action
 * still counts as done.
 *
 * Actions are dotted verbs: "page.create", "page.publish", "page.unpublish",
 * "page.schedule", "page.delete", "page.restore", "page.slug", "page.visibility",
 * "page.review", "category.create", "navigation.save", "settings.save",
 * "user.create", "user.delete", "user.role", "media.upload", "media.delete",
 * "redirect.create", "redirect.delete", "comment.delete", "auth.login",
 * "auth.login_failed", "auth.2fa_enable", "auth.2fa_disable", "token.create"…
 */
export type ActivityInput = {
  /** The signed-in user (or the MCP token's user); null for anonymous events such as a failed login. */
  user: { id: string; name: string } | null;
  action: string;
  target?: { type: string; id?: string | null; label?: string | null };
  meta?: Record<string, unknown>;
};

export async function logActivity({ user, action, target, meta }: ActivityInput): Promise<void> {
  try {
    await db.insert(schema.activityLog).values({
      userId: user?.id ?? null,
      actorName: user?.name ?? "Sistem",
      action,
      targetType: target?.type ?? null,
      targetId: target?.id ?? null,
      targetLabel: target?.label?.slice(0, 200) ?? null,
      meta: meta ?? {},
    });
  } catch (error) {
    console.error("[activity] gagal mencatat", action, error);
  }
}

/** A page's name for the log: its working title, live title, or slug. */
export async function pageLabels(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const rows = await db
    .select({ id: schema.pages.id, draftTitle: schema.pages.draftTitle, title: schema.pages.title, slug: schema.pages.slug, kind: schema.pages.kind })
    .from(schema.pages)
    .where(ids.length === 1 ? eq(schema.pages.id, ids[0]) : inArray(schema.pages.id, ids));
  return new Map(rows.map((r) => [r.id, r.kind === "home" ? "Beranda" : r.draftTitle || r.title || r.slug]));
}

export async function pageLabel(id: string): Promise<string | null> {
  return (await pageLabels([id])).get(id) ?? null;
}

/** Entries are kept for a year. */
export const ACTIVITY_RETENTION_DAYS = 365;
const PRUNE_EVERY_MS = 6 * 60 * 60 * 1000;
const pruneState = globalThis as unknown as { __docskuActivityPrunedAt?: number };

/** Deletes entries older than the retention; runs at most every 6 hours per process (called by the scheduler tick). */
export async function pruneActivity() {
  const now = Date.now();
  if (pruneState.__docskuActivityPrunedAt && now - pruneState.__docskuActivityPrunedAt < PRUNE_EVERY_MS) return;
  pruneState.__docskuActivityPrunedAt = now;
  try {
    await db.delete(schema.activityLog).where(sql`${schema.activityLog.createdAt} < now() - make_interval(days => ${ACTIVITY_RETENTION_DAYS})`);
  } catch (error) {
    console.error("[activity] gagal membersihkan log lama", error);
  }
}

/** Filters of /admin/activity: kinds group dotted actions by their prefix. */
export const ACTIVITY_KINDS = {
  halaman: { label: "Halaman & templat", prefixes: ["page.", "template.", "glossary.", "note."] },
  struktur: { label: "Kategori, navigasi & beranda", prefixes: ["category.", "navigation.", "home.", "version."] },
  komentar: { label: "Komentar", prefixes: ["comment."] },
  media: { label: "Media", prefixes: ["media."] },
  pengguna: { label: "Pengguna", prefixes: ["user."] },
  masuk: { label: "Masuk & keamanan", prefixes: ["auth."] },
  pengaturan: { label: "Pengaturan & tema", prefixes: ["settings.", "theme."] },
  redirect: { label: "Redirect", prefixes: ["redirect."] },
  integrasi: { label: "Token, MCP, webhook & Telegram", prefixes: ["token.", "mcp.", "webhook.", "telegram."] },
} as const;
export type ActivityKind = keyof typeof ACTIVITY_KINDS;
export const ACTIVITY_PER_PAGE = 50;

export type ActivityRow = {
  id: string;
  userId: string | null;
  actorName: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
  /** For page and user targets: whether it still exists (others are assumed to). */
  targetExists: boolean;
};

export async function listActivity({
  userId,
  kind,
  days,
  target,
  page,
}: {
  /** A user id, or "sistem" for entries without one. */
  userId?: string;
  kind?: ActivityKind;
  days?: number;
  target?: { type: string; id: string };
  page: number;
}) {
  const conditions = [sql`true`];
  if (userId === "sistem") conditions.push(sql`a.user_id is null`);
  else if (userId) conditions.push(sql`a.user_id = ${userId}`);
  if (kind) {
    const likes = ACTIVITY_KINDS[kind].prefixes.map((p) => sql`a.action like ${`${p}%`}`);
    conditions.push(sql`(${sql.join(likes, sql` or `)})`);
  }
  if (days) conditions.push(sql`a.created_at >= now() - make_interval(days => ${days})`);
  if (target) conditions.push(sql`a.target_type = ${target.type} and a.target_id = ${target.id}`);
  const where = sql.join(conditions, sql` and `);

  const rows = await db.execute<{
    id: string;
    user_id: string | null;
    actor_name: string;
    action: string;
    target_type: string | null;
    target_id: string | null;
    target_label: string | null;
    meta: Record<string, unknown>;
    created_at: Date | string;
    target_exists: boolean;
    total: number;
  }>(sql`
    select a.*,
      case a.target_type
        when 'page' then exists (select 1 from pages p where p.id::text = a.target_id)
        when 'user' then exists (select 1 from users u where u.id::text = a.target_id)
        when 'media' then exists (select 1 from media m where m.id::text = a.target_id)
        else true
      end as target_exists,
      (count(*) over ())::int as total
    from activity_log a
    where ${where}
    order by a.created_at desc
    limit ${ACTIVITY_PER_PAGE} offset ${(page - 1) * ACTIVITY_PER_PAGE}`);

  return {
    total: rows[0]?.total ?? 0,
    rows: [...rows].map(
      (r): ActivityRow => ({
        id: r.id,
        userId: r.user_id,
        actorName: r.actor_name,
        action: r.action,
        targetType: r.target_type,
        targetId: r.target_id,
        targetLabel: r.target_label,
        meta: r.meta ?? {},
        createdAt: new Date(r.created_at).toISOString(),
        targetExists: r.target_exists,
      }),
    ),
  };
}

/** People who appear in the log (current accounts first), for the filter. */
export async function listActivityPeople() {
  const rows = await db.execute<{ id: string; name: string }>(sql`
    select u.id, u.name from users u order by u.name`);
  return [...rows];
}
