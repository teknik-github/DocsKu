import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { decryptSecret } from "@/lib/crypto";
import type { WebhookKind } from "@/lib/notifications/catalog";
import { maskTarget } from "@/lib/notifications/webhooks";

/** Data for Pengaturan → Email and → Webhook (admins). Secrets never leave the server: targets are masked. */

export type WebhookView = {
  id: string;
  name: string;
  kind: WebhookKind;
  /** Masked: host and the last characters. */
  target: string;
  events: string[];
  enabled: boolean;
  hasSecret: boolean;
  createdAt: string;
};

export type DeliveryView = {
  id: string;
  webhookId: string;
  webhookName: string;
  event: string;
  status: string;
  attempts: number;
  responseStatus: number | null;
  lastError: string | null;
  createdAt: string;
  deliveredAt: string | null;
};

export async function loadWebhooks(): Promise<{ hooks: WebhookView[]; deliveries: DeliveryView[] }> {
  const [hooks, deliveries] = await Promise.all([
    db.select().from(schema.webhooks).orderBy(schema.webhooks.createdAt),
    db
      .select({
        id: schema.webhookDeliveries.id,
        webhookId: schema.webhookDeliveries.webhookId,
        webhookName: schema.webhooks.name,
        event: schema.webhookDeliveries.event,
        status: schema.webhookDeliveries.status,
        attempts: schema.webhookDeliveries.attempts,
        responseStatus: schema.webhookDeliveries.responseStatus,
        lastError: schema.webhookDeliveries.lastError,
        createdAt: schema.webhookDeliveries.createdAt,
        deliveredAt: schema.webhookDeliveries.deliveredAt,
      })
      .from(schema.webhookDeliveries)
      .innerJoin(schema.webhooks, eq(schema.webhooks.id, schema.webhookDeliveries.webhookId))
      .orderBy(desc(schema.webhookDeliveries.createdAt))
      .limit(20),
  ]);
  return {
    hooks: hooks.map((h) => {
      const target = decryptSecret(h.target);
      return {
        id: h.id,
        name: h.name,
        kind: h.kind as WebhookKind,
        target: target === null ? "(tidak bisa dibuka — simpan ulang)" : maskTarget(h.kind as WebhookKind, target),
        events: h.events,
        enabled: h.enabled,
        hasSecret: Boolean(h.secret),
        createdAt: h.createdAt.toISOString(),
      };
    }),
    deliveries: deliveries.map((d) => ({ ...d, createdAt: d.createdAt.toISOString(), deliveredAt: d.deliveredAt?.toISOString() ?? null })),
  };
}

/** Outbox health for the Email section: waiting, sent and failed in the last 7 days, and the latest error. */
export async function outboxStats() {
  const [row] = await db.execute<{ pending: number; sent: number; failed: number; last_error: string | null }>(sql`
    select count(*) filter (where status in ('pending', 'sending'))::int as pending,
      count(*) filter (where status = 'sent' and created_at > now() - interval '7 days')::int as sent,
      count(*) filter (where status = 'failed' and created_at > now() - interval '7 days')::int as failed,
      (select last_error from email_outbox where last_error is not null order by created_at desc limit 1) as last_error
    from email_outbox`);
  return { pending: row?.pending ?? 0, sent: row?.sent ?? 0, failed: row?.failed ?? 0, lastError: row?.last_error ?? null };
}
