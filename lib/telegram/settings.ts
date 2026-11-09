import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { decryptSecret } from "@/lib/crypto";

/**
 * Settings key `telegram`: the site's bot (Pengaturan → Telegram, admins).
 * The token and the webhook secret are AES-GCM encrypted with ENCRYPTION_KEY
 * and never sent to the browser.
 */
export type StoredTelegramSettings = {
  enabled: boolean;
  /** Encrypted bot token from @BotFather. */
  token: string | null;
  /** Encrypted secret Telegram sends back in X-Telegram-Bot-Api-Secret-Token. */
  secret: string | null;
  botUsername: string | null;
  botName: string | null;
  /** The site address the webhook was registered for (https://…/api/telegram). */
  origin: string | null;
  connectedAt: string | null;
};

export type TelegramSettingsView = Pick<StoredTelegramSettings, "enabled" | "botUsername" | "botName" | "origin" | "connectedAt"> & { hasToken: boolean };

export const DEFAULT_TELEGRAM: StoredTelegramSettings = { enabled: false, token: null, secret: null, botUsername: null, botName: null, origin: null, connectedAt: null };

export async function readTelegramSettings(): Promise<StoredTelegramSettings> {
  const [row] = await db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, "telegram"));
  return { ...DEFAULT_TELEGRAM, ...((row?.value as Partial<StoredTelegramSettings> | undefined) ?? {}) };
}

export const telegramView = (s: StoredTelegramSettings): TelegramSettingsView => ({
  enabled: s.enabled,
  botUsername: s.botUsername,
  botName: s.botName,
  origin: s.origin,
  connectedAt: s.connectedAt,
  hasToken: Boolean(s.token),
});

/** The bot's token and secret when the bot is on and both can be decrypted. */
export function telegramCredentials(s: StoredTelegramSettings): { token: string; secret: string } | null {
  if (!s.enabled || !s.token || !s.secret) return null;
  const token = decryptSecret(s.token);
  const secret = decryptSecret(s.secret);
  return token && secret ? { token, secret } : null;
}

export async function telegramReady(): Promise<{ token: string; secret: string; settings: StoredTelegramSettings } | null> {
  const settings = await readTelegramSettings();
  const credentials = telegramCredentials(settings);
  return credentials ? { ...credentials, settings } : null;
}

export const TOKEN_PATTERN = /^\d{5,}:[A-Za-z0-9_-]{30,}$/;
