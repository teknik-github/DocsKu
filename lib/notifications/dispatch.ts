import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { NotifyEvent } from "@/lib/notify";
import { prefOn, type EmailEventKey } from "@/lib/notifications/catalog";
import { emailReady, readEmailSettings, rememberOrigin, siteOrigin } from "@/lib/notifications/settings";
import { eventEmail } from "@/lib/notifications/templates";
import type { DeliveryPayload } from "@/lib/notifications/webhooks";

/**
 * Turns an event into outbox rows (one email per recipient) and webhook
 * delivery rows. Nothing is sent here: the scheduler tick delivers
 * (lib/notifications/deliver.ts). Links are made absolute now, so a message
 * sent later still points at the right site.
 */

type Recipient = { id: string; email: string; name: string; role: string; prefs: Record<string, boolean> };

export async function siteName(): Promise<string> {
  const [row] = await db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, "site"));
  return ((row?.value as { name?: string } | undefined)?.name || "Docsku").slice(0, 80);
}

/** Learns the public address from the current request when SITE_URL is unset (not available in the scheduler). */
async function learnOrigin() {
  if (process.env.SITE_URL) return;
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    const trust = process.env.TRUST_PROXY === "1" || process.env.TRUST_PROXY === "cloudflare";
    const host = (trust && h.get("x-forwarded-host")) || h.get("host");
    const proto = (trust && h.get("x-forwarded-proto")?.split(",")[0].trim()) || (host?.startsWith("localhost") || host?.startsWith("127.") ? "http" : "https");
    if (host) rememberOrigin(`${proto}://${host}`);
  } catch {
    /* outside a request */
  }
}

async function team(): Promise<Recipient[]> {
  const rows = await db
    .select({ id: schema.users.id, email: schema.users.email, name: schema.users.name, role: schema.users.role, prefs: schema.users.notificationPrefs })
    .from(schema.users);
  return rows.map((r) => ({ ...r, prefs: r.prefs ?? {} }));
}

/** Owner and author of a page (either may be null). */
async function pagePeople(pageId: string | undefined | null): Promise<string[]> {
  if (!pageId) return [];
  const [page] = await db
    .select({ owner: schema.pages.ownerId, author: schema.pages.authorId, requester: schema.pages.approvalRequestedById })
    .from(schema.pages)
    .where(eq(schema.pages.id, pageId));
  return [page?.owner, page?.author].filter((id): id is string => Boolean(id));
}

async function commentPageId(commentId: string): Promise<string | null> {
  const [row] = await db.select({ pageId: schema.pageComments.pageId }).from(schema.pageComments).where(eq(schema.pageComments.id, commentId));
  return row?.pageId ?? null;
}

/** Who gets an email for this event (before the actor is removed). */
async function emailRecipients(event: NotifyEvent, people: Recipient[]): Promise<{ key: EmailEventKey; ids: Set<string> } | null> {
  const ids = new Set<string>();
  const byRole = (key: EmailEventKey, roles: string[]) => people.filter((p) => roles.includes(p.role) && prefOn(p.prefs, key)).forEach((p) => ids.add(p.id));
  const personal = (key: EmailEventKey, list: (string | null | undefined)[]) =>
    list.forEach((id) => {
      const p = id ? people.find((x) => x.id === id) : undefined;
      if (p && prefOn(p.prefs, key)) ids.add(p.id);
    });

  switch (event.type) {
    case "comment.new":
      byRole("comment.new", ["admin", "editor"]);
      personal("comment.new", await pagePeople(await commentPageId(event.commentId)));
      return { key: "comment.new", ids };
    case "feedback.new":
      byRole("feedback.new", ["admin"]);
      personal("feedback.new", await pagePeople(event.pageId));
      return { key: "feedback.new", ids };
    case "page.submitted":
      byRole("page.submitted", ["admin", "editor"]);
      return { key: "page.submitted", ids };
    case "page.approved":
    case "page.changes_requested": {
      const [page] = await db.select({ requester: schema.pages.approvalRequestedById }).from(schema.pages).where(eq(schema.pages.id, event.pageId));
      personal(event.type, [event.authorId, page?.requester]);
      return { key: event.type, ids };
    }
    case "page.published":
      byRole("page.published", ["admin", "editor", "contributor"]);
      return { key: "page.published", ids };
    case "search.misses":
      return null;
  }
}

export async function dispatch(event: NotifyEvent): Promise<void> {
  await learnOrigin();
  const [hooks, settings] = await Promise.all([
    db
      .select({ id: schema.webhooks.id })
      .from(schema.webhooks)
      .where(sql`${schema.webhooks.enabled} and ${event.type} = any(${schema.webhooks.events})`),
    readEmailSettings(),
  ]);
  const wantsEmail = emailReady(settings) && event.type !== "search.misses";
  if (!hooks.length && !wantsEmail) return;

  const [name, origin] = await Promise.all([siteName(), siteOrigin()]);

  if (hooks.length) {
    const payload: DeliveryPayload = { event, siteName: name, origin };
    await db.insert(schema.webhookDeliveries).values(hooks.map((hook) => ({ webhookId: hook.id, event: event.type, payload: payload as unknown as Record<string, unknown> })));
  }

  if (wantsEmail) {
    const people = await team();
    const target = await emailRecipients(event, people);
    if (!target) return;
    if (event.actorId) target.ids.delete(event.actorId);
    const content = eventEmail(event, name, origin);
    if (!content || !target.ids.size) return;
    const recipients = people.filter((p) => target.ids.has(p.id) && p.email);
    if (!recipients.length) return;
    await db.insert(schema.emailOutbox).values(
      recipients.map((p) => ({ to: p.email, subject: content.subject, text: content.text, html: content.html, event: event.type })),
    );
  }
}

/** For digests: everyone with an email address, with their preferences. */
export async function teamWithPrefs() {
  return team();
}

