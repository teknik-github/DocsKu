"use server";

import { randomBytes, randomInt } from "node:crypto";
import { headers } from "next/headers";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { authorize } from "@/lib/auth/dal";
import { canEncrypt, decryptSecret, encryptSecret } from "@/lib/crypto";
import { logActivity } from "@/lib/activity";
import { BOT_COMMANDS, sendHtml, tg, TelegramError } from "@/lib/telegram/api";
import { hashCode } from "@/lib/telegram/bot";
import { readTelegramSettings, telegramCredentials, TOKEN_PATTERN, type StoredTelegramSettings, type TelegramSettingsView, telegramView } from "@/lib/telegram/settings";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** The address Telegram should call: SITE_URL, else the one this dashboard is reached at. */
async function publicOrigin(): Promise<string> {
  const configured = process.env.SITE_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  const h = await headers();
  const trust = process.env.TRUST_PROXY === "1" || process.env.TRUST_PROXY === "cloudflare";
  const host = (trust && h.get("x-forwarded-host")) || h.get("host") || "";
  const proto = (trust && h.get("x-forwarded-proto")?.split(",")[0].trim()) || (/^(localhost|127\.)/.test(host) ? "http" : "https");
  return host ? `${proto}://${host}` : "";
}

async function store(value: StoredTelegramSettings) {
  await db.insert(schema.settings).values({ key: "telegram", value }).onConflictDoUpdate({ target: schema.settings.key, set: { value } });
}

const failure = (error: unknown) => (error instanceof TelegramError ? `Telegram menolak: ${error.message}` : "Tidak bisa terhubung ke Telegram.");

/**
 * Pengaturan → Telegram (admins): checks the token with getMe, registers the
 * webhook with a fresh secret, sets the command menu and switches the bot on.
 * Without a new token, re-registers the stored one (e.g. after the address changed).
 */
export async function connectTelegramBot(input: { token?: string }): Promise<Result<{ view: TelegramSettingsView }>> {
  const user = await authorize("admin");
  if ("error" in user) return { ok: false, error: user.error };
  if (!canEncrypt()) return { ok: false, error: "ENCRYPTION_KEY belum diatur di server, token tidak bisa disimpan dengan aman." };
  const current = await readTelegramSettings();
  const typed = typeof input?.token === "string" ? input.token.trim() : "";
  let token = typed;
  if (!token) {
    const stored = current.token ? decryptSecret(current.token) : null;
    if (!stored) return { ok: false, error: "Tempel token bot dari @BotFather." };
    token = stored;
  }
  if (!TOKEN_PATTERN.test(token)) return { ok: false, error: "Token bot tidak valid (contoh 123456789:ABC…)." };

  const origin = await publicOrigin();
  if (!origin) return { ok: false, error: "Alamat situs tidak diketahui. Atur SITE_URL di server." };
  if (!origin.startsWith("https://") && !process.env.TELEGRAM_API_URL) {
    return { ok: false, error: `Telegram hanya mengirim ke alamat https. Situs ini terbuka di ${origin}; atur SITE_URL ke alamat https publik.` };
  }

  let me: { username?: string; first_name?: string };
  try {
    me = await tg<{ username?: string; first_name?: string }>(token, "getMe");
  } catch (error) {
    return { ok: false, error: error instanceof TelegramError && error.code === 401 ? "Token bot salah atau sudah dicabut." : failure(error) };
  }
  const secret = randomBytes(32).toString("hex");
  try {
    await tg(token, "setWebhook", { url: `${origin}/api/telegram`, secret_token: secret, allowed_updates: ["message", "callback_query"], drop_pending_updates: true, max_connections: 10 });
    await tg(token, "setMyCommands", { commands: BOT_COMMANDS }).catch(() => {});
  } catch (error) {
    return { ok: false, error: failure(error) };
  }
  const value: StoredTelegramSettings = {
    enabled: true,
    token: encryptSecret(token),
    secret: encryptSecret(secret),
    botUsername: me.username ?? null,
    botName: me.first_name ?? null,
    origin,
    connectedAt: new Date().toISOString(),
  };
  await store(value);
  await logActivity({ user, action: "settings.save", target: { type: "settings", id: "telegram", label: "Telegram" }, meta: { bot: me.username ?? null } });
  return { ok: true, view: telegramView(value) };
}

/** Switches the bot off (the webhook is removed; links and the token stay for switching it back on). */
export async function disconnectTelegramBot(): Promise<Result<{ view: TelegramSettingsView }>> {
  const user = await authorize("admin");
  if ("error" in user) return { ok: false, error: user.error };
  const current = await readTelegramSettings();
  const credentials = telegramCredentials(current);
  if (credentials) await tg(credentials.token, "deleteWebhook", {}).catch(() => {});
  const value = { ...current, enabled: false };
  await store(value);
  await logActivity({ user, action: "settings.save", target: { type: "settings", id: "telegram", label: "Telegram" }, meta: { enabled: false } });
  return { ok: true, view: telegramView(value) };
}

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Profil → Telegram: a one-time code (10 minutes) to send to the bot as "/start <code>". */
export async function createTelegramLinkCode(): Promise<Result<{ code: string; botUsername: string | null; expiresAt: string }>> {
  const user = await authorize("any");
  if ("error" in user) return { ok: false, error: user.error };
  const settings = await readTelegramSettings();
  if (!telegramCredentials(settings)) return { ok: false, error: "Bot Telegram belum diaktifkan oleh admin." };
  const code = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  const [row] = await db
    .insert(schema.telegramLinks)
    .values({ userId: user.id, codeHash: hashCode(code), codeExpiresAt: sql`now() + interval '10 minutes'` })
    .onConflictDoUpdate({ target: schema.telegramLinks.userId, set: { codeHash: hashCode(code), codeExpiresAt: sql`now() + interval '10 minutes'` } })
    .returning({ expiresAt: schema.telegramLinks.codeExpiresAt });
  return { ok: true, code, botUsername: settings.botUsername, expiresAt: row.expiresAt!.toISOString() };
}

/** The person's link, for Profil (polled while a code is shown). */
export async function getTelegramLink(): Promise<{ linked: boolean; username: string | null; linkedAt: string | null }> {
  const user = await authorize("any");
  if ("error" in user) return { linked: false, username: null, linkedAt: null };
  const [row] = await db
    .select({ chatId: schema.telegramLinks.chatId, username: schema.telegramLinks.username, linkedAt: schema.telegramLinks.linkedAt })
    .from(schema.telegramLinks)
    .where(eq(schema.telegramLinks.userId, user.id));
  return { linked: Boolean(row?.chatId), username: row?.username ?? null, linkedAt: row?.linkedAt?.toISOString() ?? null };
}

export async function unlinkTelegram(): Promise<Result> {
  const user = await authorize("any");
  if ("error" in user) return { ok: false, error: user.error };
  const [row] = await db
    .update(schema.telegramLinks)
    .set({ chatId: null, username: null, linkedAt: null, conversationId: null, codeHash: null, codeExpiresAt: null })
    .where(eq(schema.telegramLinks.userId, user.id))
    .returning({ userId: schema.telegramLinks.userId });
  if (row) await logActivity({ user, action: "telegram.unlink" });
  return { ok: true };
}

/** "Kirim pesan uji" to the person's own linked chat. */
export async function sendTelegramTest(): Promise<Result> {
  const user = await authorize("any");
  if ("error" in user) return { ok: false, error: user.error };
  const credentials = telegramCredentials(await readTelegramSettings());
  if (!credentials) return { ok: false, error: "Bot Telegram belum aktif." };
  const [row] = await db.select({ chatId: schema.telegramLinks.chatId }).from(schema.telegramLinks).where(eq(schema.telegramLinks.userId, user.id));
  if (!row?.chatId) return { ok: false, error: "Akun Anda belum terhubung ke Telegram." };
  try {
    await sendHtml(credentials.token, row.chatId, "🔔 Pesan uji dari Docsku. Notifikasi Telegram Anda berfungsi.");
  } catch (error) {
    return { ok: false, error: failure(error) };
  }
  return { ok: true };
}
