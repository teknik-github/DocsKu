"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { authorize } from "@/lib/auth/dal";
import { logActivity } from "@/lib/activity";
import { canEncrypt, encryptSecret } from "@/lib/crypto";
import { EMAIL_EVENTS, WEBHOOK_EVENT_KEYS, type WebhookKind } from "@/lib/notifications/catalog";
import { siteName } from "@/lib/notifications/dispatch";
import { deliverOne, fromHeader, mailer } from "@/lib/notifications/deliver";
import { emailView, readEmailSettings, rememberOrigin, siteOrigin, type EmailSettingsView, type StoredEmailSettings } from "@/lib/notifications/settings";
import { renderEmail } from "@/lib/notifications/templates";
import { validateTarget, type DeliveryPayload } from "@/lib/notifications/webhooks";

type Result<T = undefined> = ({ ok: true } & (T extends undefined ? object : { value: T })) | { ok: false; error: string };

/** The dashboard's own address, remembered for links in messages queued by the scheduler. */
async function currentOrigin(): Promise<string | undefined> {
  const h = await headers();
  const trust = process.env.TRUST_PROXY === "1" || process.env.TRUST_PROXY === "cloudflare";
  const host = (trust && h.get("x-forwarded-host")) || h.get("host");
  if (!host) return undefined;
  const proto = (trust && h.get("x-forwarded-proto")?.split(",")[0].trim()) || (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  const origin = `${proto}://${host}`;
  rememberOrigin(origin);
  return origin;
}

/* ---------------------------------------------------------------- email -- */

const emailSchema = z.object({
  enabled: z.boolean(),
  host: z.string().trim().max(200).regex(/^[A-Za-z0-9.-]*$/, "Host SMTP tidak valid."),
  port: z.number().int().min(1).max(65535),
  security: z.enum(["tls", "starttls", "none"]),
  user: z.string().trim().max(200),
  /** null keeps the stored password, "" removes it. */
  password: z.string().max(500).nullable(),
  fromName: z.string().trim().max(80),
  fromAddress: z.union([z.literal(""), z.email("Alamat pengirim tidak valid.")]),
});

/** Pengaturan → Email. Admins only. */
export async function saveEmailSettings(input: z.input<typeof emailSchema>): Promise<Result<EmailSettingsView>> {
  const user = await authorize("admin");
  if ("error" in user) return { ok: false, error: user.error };
  const parsed = emailSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { password, ...rest } = parsed.data;
  if (rest.enabled && (!rest.host || !rest.fromAddress)) return { ok: false, error: "Isi host SMTP dan alamat pengirim sebelum mengaktifkan email." };
  const current = await readEmailSettings();
  let sealed = current.password;
  if (password !== null) {
    if (password && !canEncrypt()) return { ok: false, error: "ENCRYPTION_KEY belum diatur di server, jadi password SMTP tidak bisa disimpan dengan aman." };
    sealed = password ? encryptSecret(password) : "";
  }
  const value: StoredEmailSettings = { ...rest, password: sealed, origin: (await currentOrigin()) ?? current.origin };
  await db.insert(schema.settings).values({ key: "email", value }).onConflictDoUpdate({ target: schema.settings.key, set: { value } });
  await logActivity({
    user: { id: user.id, name: user.name },
    action: "settings.save",
    target: { type: "settings", id: "email", label: "Email" },
    meta: { section: "email", enabled: value.enabled, host: value.host, password: password === null ? "tetap" : password ? "diganti" : "dihapus" },
  });
  return { ok: true, value: emailView(value) };
}

/** "Kirim email uji": sends now (not through the outbox) to the admin's own address, with the saved settings. */
export async function sendTestEmail(): Promise<Result<string>> {
  const user = await authorize("admin");
  if ("error" in user) return { ok: false, error: user.error };
  const settings = await readEmailSettings();
  if (!settings.host || !settings.fromAddress) return { ok: false, error: "Simpan host SMTP dan alamat pengirim dulu." };
  await currentOrigin();
  const [name, origin] = await Promise.all([siteName(), siteOrigin()]);
  const content = renderEmail({
    siteName: name,
    subject: `[${name}] Email uji`,
    heading: "Pengaturan email berfungsi",
    lines: [`Halo ${user.name}, email ini dikirim dari Pengaturan → Email untuk memastikan server SMTP tersambung.`],
    action: origin ? { label: "Buka dasbor", url: `${origin}/admin` } : null,
  });
  try {
    await mailer(settings).sendMail({ from: fromHeader(settings), to: user.email, subject: content.subject, text: content.text, html: content.html });
  } catch (error) {
    return { ok: false, error: `Gagal mengirim: ${(error instanceof Error ? error.message : String(error)).slice(0, 300)}` };
  }
  return { ok: true, value: user.email };
}

/** Profil → Notifikasi: the person's own switches (email keys, and "tg:<key>" for Telegram). */
export async function saveNotificationPrefs(input: Record<string, boolean>): Promise<Result> {
  const user = await authorize("any");
  if ("error" in user) return { ok: false, error: user.error };
  const visible = EMAIL_EVENTS.filter((e) => e.visibleTo.includes(user.role));
  const allowed = [...visible.map((e) => e.key as string), ...visible.filter((e) => e.telegram).map((e) => `tg:${e.key}`)];
  const prefs = Object.fromEntries(Object.entries(input ?? {}).filter(([key, value]) => allowed.includes(key) && typeof value === "boolean"));
  await db.update(schema.users).set({ notificationPrefs: prefs }).where(eq(schema.users.id, user.id));
  return { ok: true };
}

/* ------------------------------------------------------------- webhooks -- */

const webhookSchema = z.object({
  name: z.string().trim().min(1, "Beri nama webhook.").max(60),
  kind: z.enum(["slack", "discord", "telegram", "custom"]),
  target: z.string().trim().min(1, "Isi URL atau token.").max(1000),
  /** Custom only; blank makes one. */
  secret: z.string().trim().max(200).optional(),
  events: z.array(z.enum(WEBHOOK_EVENT_KEYS)).min(1, "Pilih minimal satu kejadian."),
});

async function adminOnly() {
  const user = await authorize("admin");
  if ("error" in user) return { error: user.error } as const;
  if (!canEncrypt()) return { error: "ENCRYPTION_KEY belum diatur di server, jadi webhook tidak bisa disimpan dengan aman." } as const;
  return user;
}

/** Creates a webhook. For custom URLs the signing secret is returned once (it can't be shown again). */
export async function createWebhook(input: z.input<typeof webhookSchema>): Promise<Result<{ id: string; secret: string | null }>> {
  const user = await adminOnly();
  if ("error" in user) return { ok: false, error: user.error };
  const parsed = webhookSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const target = validateTarget(parsed.data.kind, parsed.data.target);
  if (!target.ok) return { ok: false, error: target.error };
  const secret = parsed.data.kind === "custom" ? parsed.data.secret || `whsec_${randomBytes(24).toString("base64url")}` : null;
  await currentOrigin();
  const [row] = await db
    .insert(schema.webhooks)
    .values({
      name: parsed.data.name,
      kind: parsed.data.kind,
      target: encryptSecret(target.target),
      secret: secret ? encryptSecret(secret) : null,
      events: parsed.data.events,
      createdById: user.id,
    })
    .returning({ id: schema.webhooks.id });
  await logActivity({ user: { id: user.id, name: user.name }, action: "webhook.create", target: { type: "webhook", id: row.id, label: parsed.data.name }, meta: { kind: parsed.data.kind, events: parsed.data.events } });
  return { ok: true, value: { id: row.id, secret: parsed.data.secret ? null : secret } };
}

const updateSchema = z.object({
  name: z.string().trim().min(1, "Beri nama webhook.").max(60).optional(),
  events: z.array(z.enum(WEBHOOK_EVENT_KEYS)).min(1, "Pilih minimal satu kejadian.").optional(),
  enabled: z.boolean().optional(),
  /** A new URL/token; omitted keeps the stored one. */
  target: z.string().trim().min(1).max(1000).optional(),
});

export async function updateWebhook(id: string, input: z.input<typeof updateSchema>): Promise<Result> {
  const user = await adminOnly();
  if ("error" in user) return { ok: false, error: user.error };
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Webhook tidak ditemukan." };
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const [hook] = await db.select({ kind: schema.webhooks.kind, name: schema.webhooks.name }).from(schema.webhooks).where(eq(schema.webhooks.id, id));
  if (!hook) return { ok: false, error: "Webhook tidak ditemukan." };
  const set: Partial<typeof schema.webhooks.$inferInsert> = {};
  if (parsed.data.name !== undefined) set.name = parsed.data.name;
  if (parsed.data.events !== undefined) set.events = parsed.data.events;
  if (parsed.data.enabled !== undefined) set.enabled = parsed.data.enabled;
  if (parsed.data.target !== undefined) {
    const target = validateTarget(hook.kind as WebhookKind, parsed.data.target);
    if (!target.ok) return { ok: false, error: target.error };
    set.target = encryptSecret(target.target);
  }
  await db.update(schema.webhooks).set(set).where(eq(schema.webhooks.id, id));
  // Switched off: what was waiting is dropped rather than flooding the channel when it's back on.
  if (parsed.data.enabled === false) {
    await db.execute(sql`update webhook_deliveries set status = 'skipped', last_error = 'Webhook dimatikan' where webhook_id = ${id} and status in ('pending', 'sending')`);
  }
  await logActivity({ user: { id: user.id, name: user.name }, action: "webhook.update", target: { type: "webhook", id, label: parsed.data.name ?? hook.name }, meta: { fields: Object.keys(set) } });
  return { ok: true };
}

export async function deleteWebhook(id: string): Promise<Result> {
  const user = await authorize("admin");
  if ("error" in user) return { ok: false, error: user.error };
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Webhook tidak ditemukan." };
  const [hook] = await db.delete(schema.webhooks).where(eq(schema.webhooks.id, id)).returning({ name: schema.webhooks.name });
  if (!hook) return { ok: false, error: "Webhook tidak ditemukan." };
  await logActivity({ user: { id: user.id, name: user.name }, action: "webhook.delete", target: { type: "webhook", id, label: hook.name } });
  return { ok: true };
}

async function hookRow(id: string) {
  const [hook] = await db
    .select({ id: schema.webhooks.id, kind: schema.webhooks.kind, target: schema.webhooks.target, secret: schema.webhooks.secret })
    .from(schema.webhooks)
    .where(eq(schema.webhooks.id, id));
  return hook;
}

/** "Kirim uji": a sample event, delivered right now; the result is shown and logged under the deliveries. */
export async function testWebhook(id: string): Promise<Result<{ status: number | null; error: string | null }>> {
  const user = await authorize("admin");
  if ("error" in user) return { ok: false, error: user.error };
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Webhook tidak ditemukan." };
  const hook = await hookRow(id);
  if (!hook) return { ok: false, error: "Webhook tidak ditemukan." };
  await currentOrigin();
  const [name, origin] = await Promise.all([siteName(), siteOrigin()]);
  const payload: DeliveryPayload = { event: { type: "page.published", pageId: "00000000-0000-0000-0000-000000000000", title: "Contoh halaman", href: "/docs", by: user.name }, siteName: name, origin, test: true };
  const [delivery] = await db
    .insert(schema.webhookDeliveries)
    .values({ webhookId: id, event: "test", payload: payload as unknown as Record<string, unknown>, status: "sending" })
    .returning({ id: schema.webhookDeliveries.id, attempts: schema.webhookDeliveries.attempts, payload: schema.webhookDeliveries.payload });
  const result = await deliverOne(delivery, hook);
  // A test is never retried in the background.
  if (!result.ok) await db.update(schema.webhookDeliveries).set({ status: "failed" }).where(eq(schema.webhookDeliveries.id, delivery.id));
  return result.ok ? { ok: true, value: { status: result.status, error: null } } : { ok: false, error: result.error ?? "Gagal mengirim." };
}

/** "Kirim ulang": sends a past delivery again now. */
export async function redeliver(deliveryId: string): Promise<Result<{ status: number | null }>> {
  const user = await authorize("admin");
  if ("error" in user) return { ok: false, error: user.error };
  if (!z.uuid().safeParse(deliveryId).success) return { ok: false, error: "Pengiriman tidak ditemukan." };
  const [delivery] = await db
    .update(schema.webhookDeliveries)
    .set({ status: "sending", attempts: 0, nextAttemptAt: sql`now()` })
    .where(eq(schema.webhookDeliveries.id, deliveryId))
    .returning({ id: schema.webhookDeliveries.id, attempts: schema.webhookDeliveries.attempts, payload: schema.webhookDeliveries.payload, webhookId: schema.webhookDeliveries.webhookId });
  if (!delivery) return { ok: false, error: "Pengiriman tidak ditemukan." };
  const hook = await hookRow(delivery.webhookId);
  if (!hook) return { ok: false, error: "Webhook tidak ditemukan." };
  const result = await deliverOne(delivery, hook);
  return result.ok ? { ok: true, value: { status: result.status } } : { ok: false, error: result.error ?? "Gagal mengirim." };
}
