import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { decryptSecret } from "@/lib/crypto";
import { dueAtSql } from "@/lib/review";
import { notify } from "@/lib/notify";
import { prefOn, RETRY_DELAYS_MIN, type WebhookKind } from "@/lib/notifications/catalog";
import { siteName, teamWithPrefs } from "@/lib/notifications/dispatch";
import { emailReady, readEmailSettings, siteOrigin, smtpPassword, type StoredEmailSettings } from "@/lib/notifications/settings";
import { renderEmail } from "@/lib/notifications/templates";
import { buildRequest, post, type DeliveryPayload } from "@/lib/notifications/webhooks";

/**
 * Delivery, run from the scheduler tick (/api/internal/publish-scheduled):
 * due outbox emails and webhook deliveries in small batches with a time
 * budget, retried with backoff (RETRY_DELAYS_MIN), then marked failed. Rows
 * are claimed with `for update skip locked`, so two servers never send the
 * same row twice. Also the weekly digest and the daily "search misses" event.
 */

const BATCH = 20;
const TICK_BUDGET_MS = 20_000;
const MAX_ATTEMPTS = RETRY_DELAYS_MIN.length + 1;

/* ---------------------------------------------------------------- email -- */

const cache = globalThis as unknown as { __docskuMailer?: { key: string; transport: Transporter }; __docskuNotifyPrunedAt?: number };

export function mailer(settings: StoredEmailSettings): Transporter {
  const password = smtpPassword(settings);
  if (password === null) throw new Error("Password SMTP tidak bisa dibuka (ENCRYPTION_KEY berubah?). Simpan ulang password di Pengaturan → Email.");
  const key = JSON.stringify([settings.host, settings.port, settings.security, settings.user, settings.password]);
  if (cache.__docskuMailer?.key === key) return cache.__docskuMailer.transport;
  cache.__docskuMailer?.transport.close();
  const transport = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.security === "tls",
    requireTLS: settings.security === "starttls",
    ignoreTLS: settings.security === "none",
    auth: settings.user ? { user: settings.user, pass: password } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  cache.__docskuMailer = { key, transport };
  return transport;
}

export const fromHeader = (s: StoredEmailSettings) => (s.fromName ? { name: s.fromName, address: s.fromAddress } : s.fromAddress);

const retryAt = (attempts: number) => sql`now() + make_interval(mins => ${RETRY_DELAYS_MIN[Math.min(attempts - 1, RETRY_DELAYS_MIN.length - 1)]})`;

async function sendEmails(deadline: number) {
  const settings = await readEmailSettings();
  if (!emailReady(settings)) {
    // Switched off: give up on what waited more than a week instead of sending stale mail later.
    await db.execute(sql`update email_outbox set status = 'failed', last_error = 'Email dimatikan' where status = 'pending' and created_at < now() - interval '7 days'`);
    return { sent: 0, failed: 0 };
  }
  const rows = await db.execute<{ id: string; to: string; subject: string; text: string; html: string | null; attempts: number }>(sql`
    update email_outbox set status = 'sending', next_attempt_at = now()
    where id in (
      select id from email_outbox
      where (status = 'pending' and next_attempt_at <= now()) or (status = 'sending' and next_attempt_at < now() - interval '10 minutes')
      order by created_at limit ${BATCH} for update skip locked)
    returning id, "to", subject, text, html, attempts`);
  let sent = 0;
  let failed = 0;
  let transport: Transporter | null = null;
  for (const [index, row] of [...rows].entries()) {
    if (Date.now() > deadline) {
      // Out of time: put the rest back without counting an attempt.
      const rest = [...rows].slice(index).map((r) => r.id);
      await db.update(schema.emailOutbox).set({ status: "pending" }).where(inArray(schema.emailOutbox.id, rest));
      break;
    }
    try {
      transport ??= mailer(settings);
      await transport.sendMail({ from: fromHeader(settings), to: row.to, subject: row.subject, text: row.text, html: row.html ?? undefined });
      await db.update(schema.emailOutbox).set({ status: "sent", sentAt: sql`now()`, attempts: row.attempts + 1, lastError: null }).where(eq(schema.emailOutbox.id, row.id));
      sent++;
    } catch (error) {
      const attempts = row.attempts + 1;
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 300);
      await db
        .update(schema.emailOutbox)
        .set(attempts >= MAX_ATTEMPTS ? { status: "failed", attempts, lastError: message } : { status: "pending", attempts, lastError: message, nextAttemptAt: retryAt(attempts) })
        .where(eq(schema.emailOutbox.id, row.id));
      failed++;
    }
  }
  return { sent, failed };
}

/* ------------------------------------------------------------- webhooks -- */

type HookRow = { id: string; kind: string; target: string; secret: string | null };

/** Sends one delivery now and records the result. Used by the tick, "Kirim uji" and "Kirim ulang". */
export async function deliverOne(delivery: { id: string; attempts: number; payload: unknown }, hook: HookRow): Promise<{ ok: boolean; status: number | null; error: string | null }> {
  const target = decryptSecret(hook.target);
  const secret = hook.secret ? decryptSecret(hook.secret) : null;
  let result: { ok: boolean; status: number | null; error: string | null };
  if (target === null) {
    result = { ok: false, status: null, error: "Alamat webhook tidak bisa dibuka (ENCRYPTION_KEY berubah?). Simpan ulang webhook ini." };
  } else {
    try {
      const { endpoint, headers, raw } = buildRequest(hook.kind as WebhookKind, target, secret, delivery.payload as DeliveryPayload, delivery.id);
      const res = await post(hook.kind as WebhookKind, endpoint, headers, raw);
      const ok = res.status >= 200 && res.status < 300;
      result = { ok, status: res.status, error: ok ? null : `HTTP ${res.status}${res.body ? `: ${res.body.replace(/\s+/g, " ").slice(0, 200)}` : ""}` };
    } catch (error) {
      result = { ok: false, status: null, error: (error instanceof Error ? error.message : String(error)).slice(0, 300) };
    }
  }
  const attempts = delivery.attempts + 1;
  await db
    .update(schema.webhookDeliveries)
    .set(
      result.ok
        ? { status: "delivered", attempts, responseStatus: result.status, lastError: null, deliveredAt: sql`now()` }
        : attempts >= MAX_ATTEMPTS
          ? { status: "failed", attempts, responseStatus: result.status, lastError: result.error }
          : { status: "pending", attempts, responseStatus: result.status, lastError: result.error, nextAttemptAt: retryAt(attempts) },
    )
    .where(eq(schema.webhookDeliveries.id, delivery.id));
  return result;
}

async function sendWebhooks(deadline: number) {
  const rows = await db.execute<{ id: string; attempts: number; payload: unknown; webhook_id: string }>(sql`
    update webhook_deliveries d set status = 'sending', next_attempt_at = now()
    where d.id in (
      select x.id from webhook_deliveries x join webhooks w on w.id = x.webhook_id and w.enabled
      where (x.status = 'pending' and x.next_attempt_at <= now()) or (x.status = 'sending' and x.next_attempt_at < now() - interval '10 minutes')
      order by x.created_at limit ${BATCH} for update of x skip locked)
    returning d.id, d.attempts, d.payload, d.webhook_id`);
  if (!rows.length) return { delivered: 0, failed: 0 };
  const hooks = await db.select({ id: schema.webhooks.id, kind: schema.webhooks.kind, target: schema.webhooks.target, secret: schema.webhooks.secret }).from(schema.webhooks);
  const byId = new Map(hooks.map((h) => [h.id, h]));
  let delivered = 0;
  let failed = 0;
  for (const [index, row] of [...rows].entries()) {
    if (Date.now() > deadline) {
      const rest = [...rows].slice(index).map((r) => r.id);
      await db.update(schema.webhookDeliveries).set({ status: "pending" }).where(inArray(schema.webhookDeliveries.id, rest));
      break;
    }
    const hook = byId.get(row.webhook_id);
    if (!hook) continue;
    const result = await deliverOne(row, hook);
    if (result.ok) delivered++;
    else failed++;
  }
  return { delivered, failed };
}

/* -------------------------------------------------------------- digests -- */

/** Asia/Jakarta calendar parts of `date`. */
function jakarta(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), weekday: parts.weekday as string };
}

type NotifyState = { digestDay?: string; missesDay?: string };

async function readState(): Promise<NotifyState> {
  const [row] = await db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, "notifications_state"));
  return (row?.value as NotifyState | undefined) ?? {};
}

/** Claims a run for this day (returns false when another tick already did). */
async function claim(field: keyof NotifyState, day: string): Promise<boolean> {
  const rows = await db.execute<{ key: string }>(sql`
    insert into settings (key, value) values ('notifications_state', ${JSON.stringify({ [field]: day })}::jsonb)
    on conflict (key) do update set value = settings.value || excluded.value, updated_at = now()
    where coalesce(settings.value->>${field}, '') <> ${day}
    returning key`);
  return rows.length > 0;
}

/** Monday 08:00 WIB: one email per person with something to report. */
export async function sendWeeklyDigest(force = false): Promise<number> {
  const settings = await readEmailSettings();
  if (!emailReady(settings)) return 0;
  const now = jakarta();
  if (!force) {
    if (now.weekday !== "Mon" || now.hour < 8) return 0;
    if ((await readState()).digestDay === now.day) return 0;
    if (!(await claim("digestDay", now.day))) return 0;
  }
  const [people, name, origin] = await Promise.all([teamWithPrefs(), siteName(), siteOrigin()]);
  const [comments] = await db.execute<{ pending: number; unanswered: number }>(sql`
    with t as (select c.*, coalesce(c.parent_id, c.id) as root from page_comments c),
    latest as (select distinct on (root) root, is_staff from t where status <> 'spam' order by root, created_at desc)
    select (select count(*) from page_comments where status = 'pending')::int as pending,
      (select count(*) from latest where not is_staff)::int as unanswered`);
  const misses = await db.execute<{ query: string; misses: number }>(sql`
    select query, sum(misses)::int as misses from search_queries
    where day >= (now() at time zone 'Asia/Jakarta')::date - 7 and misses > 0
    group by query order by misses desc limit 5`);
  let queued = 0;
  for (const person of people) {
    if (!person.email || !prefOn(person.prefs, "digest.weekly")) continue;
    const due = await db.execute<{ id: string; title: string; days: number }>(sql`
      select p.id, p.title, floor(extract(epoch from (now() - ${dueAtSql})) / 86400)::int as days
      from pages p
      where p.kind = 'doc' and p.status = 'published' and ${dueAtSql} < now()
        and (p.owner_id = ${person.id} or (p.owner_id is null and p.author_id = ${person.id}))
      order by ${dueAtSql} asc limit 10`);
    const staff = person.role === "admin" || person.role === "editor";
    const list: { title: string; items: { text: string; url?: string; meta?: string }[] }[] = [];
    if (due.length) list.push({ title: "Halaman Anda yang perlu ditinjau", items: [...due].map((d) => ({ text: d.title, url: `${origin}/admin/pages/${d.id}`, meta: `lewat ${d.days} hari` })) });
    if (staff && (comments?.pending || comments?.unanswered)) {
      list.push({
        title: "Komentar",
        items: [
          ...(comments.pending ? [{ text: `${comments.pending} menunggu persetujuan`, url: `${origin}/admin/comments?view=pending` }] : []),
          ...(comments.unanswered ? [{ text: `${comments.unanswered} belum dibalas`, url: `${origin}/admin/comments?view=unanswered` }] : []),
        ],
      });
    }
    if (staff && misses.length) list.push({ title: "Pencarian tanpa hasil (7 hari)", items: [...misses].map((m) => ({ text: m.query, meta: `${m.misses}×` })) });
    if (!list.length) continue;
    const content = renderEmail({
      siteName: name,
      subject: `[${name}] Ringkasan mingguan`,
      heading: `Ringkasan minggu ini, ${person.name.split(" ")[0]}`,
      lines: ["Yang perlu perhatian di dokumentasi:"],
      list,
      action: { label: "Buka dasbor", url: `${origin}/admin` },
    });
    await db.insert(schema.emailOutbox).values({ to: person.email, subject: content.subject, text: content.text, html: content.html, event: "digest.weekly" });
    queued++;
  }
  return queued;
}

/** 09:00 WIB: yesterday's searches without results, for webhooks subscribed to search.misses. */
async function dailySearchMisses() {
  const now = jakarta();
  if (now.hour < 9) return;
  const [hook] = await db.select({ id: schema.webhooks.id }).from(schema.webhooks).where(sql`${schema.webhooks.enabled} and 'search.misses' = any(${schema.webhooks.events})`).limit(1);
  if (!hook) return;
  if ((await readState()).missesDay === now.day) return;
  if (!(await claim("missesDay", now.day))) return;
  const rows = await db.execute<{ query: string; misses: number; day: string }>(sql`
    select query, misses, day::text as day from search_queries
    where day = (now() at time zone 'Asia/Jakarta')::date - 1 and misses > 0
    order by misses desc limit 10`);
  if (!rows.length) return;
  await notify({ type: "search.misses", day: rows[0].day, queries: [...rows].map((r) => ({ query: r.query, misses: r.misses })) });
}

/* ------------------------------------------------------------------ tick -- */

async function prune() {
  const now = Date.now();
  if (cache.__docskuNotifyPrunedAt && now - cache.__docskuNotifyPrunedAt < 6 * 60 * 60 * 1000) return;
  cache.__docskuNotifyPrunedAt = now;
  await db.execute(sql`delete from email_outbox where status in ('sent', 'failed') and created_at < now() - interval '30 days'`);
  await db.execute(sql`delete from webhook_deliveries where status in ('delivered', 'failed', 'skipped') and created_at < now() - interval '30 days'`);
}

/** One scheduler tick's worth of notification work. Never throws. */
export async function runNotifications() {
  const deadline = Date.now() + TICK_BUDGET_MS;
  const result = { sent: 0, failed: 0, delivered: 0, hookFailed: 0, digests: 0 };
  try {
    result.digests = await sendWeeklyDigest();
    await dailySearchMisses();
    const email = await sendEmails(deadline);
    result.sent = email.sent;
    result.failed = email.failed;
    const hooks = await sendWebhooks(deadline);
    result.delivered = hooks.delivered;
    result.hookFailed = hooks.failed;
    await prune();
  } catch (error) {
    console.error("[notifications]", error instanceof Error ? error.message : error);
  }
  return result;
}
