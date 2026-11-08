import "server-only";
import { createHmac } from "node:crypto";
import http from "node:http";
import https from "node:https";
import { guardedLookup, urlProblem } from "@/lib/link-check";
import type { NotifyEvent } from "@/lib/notify";
import { eventSummary } from "@/lib/notifications/templates";
import type { WebhookKind } from "@/lib/notifications/catalog";

/**
 * Outgoing webhooks. Slack, Discord and Telegram only ever go to their own
 * fixed hosts; a custom URL must be public https (every connection resolves the
 * name through the link checker's guarded lookup, so it can't reach private
 * addresses). WEBHOOK_ALLOW_PRIVATE=1 lifts that for custom URLs, for local
 * testing only.
 */

const TIMEOUT_MS = 10_000;
const allowPrivate = () => process.env.WEBHOOK_ALLOW_PRIVATE === "1";

const SLACK_HOSTS = new Set(["hooks.slack.com"]);
const DISCORD_HOSTS = new Set(["discord.com", "discordapp.com", "canary.discord.com", "ptb.discord.com"]);

/** Checks what an admin typed as the target; returns the normalised target or an error. */
export function validateTarget(kind: WebhookKind, raw: string): { ok: true; target: string } | { ok: false; error: string } {
  const value = raw.trim();
  if (kind === "telegram") {
    const [token, chat] = value.split("|").map((s) => s.trim());
    if (!/^\d{5,}:[A-Za-z0-9_-]{30,}$/.test(token ?? "")) return { ok: false, error: "Token bot Telegram tidak valid (contoh 123456:ABC…)." };
    if (!/^(-?\d{3,}|@[A-Za-z0-9_]{5,})$/.test(chat ?? "")) return { ok: false, error: "Chat id Telegram tidak valid (angka, -100…, atau @nama_kanal)." };
    return { ok: true, target: `${token}|${chat}` };
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, error: "URL tidak valid." };
  }
  if (url.username || url.password) return { ok: false, error: "URL tidak boleh berisi nama pengguna atau password." };
  if (kind === "slack") {
    if (url.protocol !== "https:" || !SLACK_HOSTS.has(url.hostname) || !url.pathname.startsWith("/services/")) return { ok: false, error: "URL Slack harus https://hooks.slack.com/services/…" };
    return { ok: true, target: url.toString() };
  }
  if (kind === "discord") {
    if (url.protocol !== "https:" || !DISCORD_HOSTS.has(url.hostname) || !url.pathname.startsWith("/api/webhooks/")) return { ok: false, error: "URL Discord harus https://discord.com/api/webhooks/…" };
    return { ok: true, target: url.toString() };
  }
  if (allowPrivate()) {
    if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, error: "Hanya http/https." };
    return { ok: true, target: url.toString() };
  }
  if (url.protocol !== "https:") return { ok: false, error: "URL webhook harus https." };
  const problem = urlProblem(url.toString());
  if (problem) return { ok: false, error: `URL ditolak: ${problem}.` };
  return { ok: true, target: url.toString() };
}

/** A short, safe label for the list: host and the last characters, never the whole secret URL or token. */
export function maskTarget(kind: WebhookKind, target: string): string {
  if (kind === "telegram") {
    const [token, chat] = target.split("|");
    return `bot …${(token ?? "").slice(-4)} → ${chat ?? ""}`;
  }
  try {
    const url = new URL(target);
    // Paths often carry the secret (…/hooks/<token>), so only the end is shown.
    return `${url.host}/…${url.pathname.slice(-4)}`;
  } catch {
    return "—";
  }
}

/** What a delivery row stores: the event, plus the site's name and address at queue time. */
export type DeliveryPayload = { event: NotifyEvent; siteName: string; origin: string; /** "Kirim uji": sent as event "test". */ test?: boolean };

const absolute = (origin: string, path: string | null) => (!path ? null : /^https?:\/\//.test(path) ? path : origin ? `${origin}${path}` : path);

/** The public JSON of a custom webhook (also the `data` documented in CLAUDE.md). */
export function customBody(payload: DeliveryPayload, deliveryId: string) {
  const { type, actorId, ...data } = payload.event;
  void actorId;
  const withUrls = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, (k === "href" && typeof v === "string" ? absolute(payload.origin, v) : v) as unknown]),
  );
  return { id: deliveryId, event: payload.test ? "test" : type, data: withUrls, site: { name: payload.siteName, url: payload.origin || null }, sentAt: new Date().toISOString() };
}

const slackEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const htmlEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** URL, headers and body for one delivery. */
export function buildRequest(kind: WebhookKind, target: string, secret: string | null, payload: DeliveryPayload, deliveryId: string) {
  const base = eventSummary(payload.event);
  const summary = payload.test ? { ...base, title: `[Uji] ${base.title}`, text: "Webhook ini tersambung. Pesan seperti ini dikirim saat ada kejadian yang dipilih." } : base;
  const url = absolute(payload.origin, summary.url);
  const type = payload.test ? "test" : payload.event.type;
  let endpoint = target;
  let body: unknown;
  if (kind === "slack") {
    const text = `*${slackEscape(summary.title)}*\n${slackEscape(summary.text)}${url ? `\n<${url}|Buka>` : ""}`;
    body = { text, blocks: [{ type: "section", text: { type: "mrkdwn", text: text.slice(0, 2900) } }, { type: "context", elements: [{ type: "mrkdwn", text: slackEscape(`${payload.siteName} · ${type}`) }] }] };
  } else if (kind === "discord") {
    body = {
      username: payload.siteName.slice(0, 80) || "Docsku",
      allowed_mentions: { parse: [] },
      embeds: [{ title: summary.title.slice(0, 250), description: summary.text.slice(0, 3900), url: url ?? undefined, color: 0x2563eb, footer: { text: `${payload.siteName} · ${type}` }, timestamp: new Date().toISOString() }],
    };
  } else if (kind === "telegram") {
    const [token, chat] = target.split("|");
    endpoint = `https://api.telegram.org/bot${token}/sendMessage`;
    body = {
      chat_id: chat,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      text: `<b>${htmlEscape(summary.title)}</b>\n${htmlEscape(summary.text)}${url ? `\n<a href="${htmlEscape(url)}">Buka</a>` : ""}`.slice(0, 4000),
    };
  } else {
    body = customBody(payload, deliveryId);
  }
  const raw = JSON.stringify(body);
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "Docsku-Webhook/1.0" };
  if (kind === "custom") {
    headers["x-docsku-event"] = type;
    headers["x-docsku-delivery"] = deliveryId;
    if (secret) headers["x-docsku-signature"] = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
  }
  return { endpoint, headers, raw };
}

/** POSTs and resolves with the status code; errors never include the URL (it may hold a token). */
export function post(kind: WebhookKind, endpoint: string, headers: Record<string, string>, raw: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    let url: URL;
    try {
      url = new URL(endpoint);
    } catch {
      return reject(new Error("URL tidak valid"));
    }
    const privateOk = kind === "custom" && allowPrivate();
    if (!privateOk && url.protocol !== "https:") return reject(new Error("Hanya https"));
    // IP literals skip DNS (and so the guarded lookup): check them here too.
    const problem = privateOk ? null : urlProblem(url.toString());
    if (problem) return reject(new Error(problem));
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      url,
      {
        method: "POST",
        headers: { ...headers, "content-length": String(Buffer.byteLength(raw)) },
        timeout: TIMEOUT_MS,
        agent: false,
        ...(privateOk ? {} : { lookup: guardedLookup }),
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          if (body.length < 2000) body += chunk;
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: body.slice(0, 2000) }));
      },
    );
    const timer = setTimeout(() => req.destroy(new Error("Waktu habis (10 detik)")), TIMEOUT_MS);
    req.on("timeout", () => req.destroy(new Error("Waktu habis (10 detik)")));
    req.on("error", (error) => reject(new Error((error.message || "Gagal terhubung").replace(/bot\d+:[A-Za-z0-9_-]+/g, "bot…"))));
    req.on("close", () => clearTimeout(timer));
    req.end(raw);
  });
}
