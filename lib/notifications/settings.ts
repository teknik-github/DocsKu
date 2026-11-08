import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { decryptSecret } from "@/lib/crypto";

/** Settings key `email`. The SMTP password is stored AES-GCM encrypted and never leaves the server. */
export type EmailSecurity = "tls" | "starttls" | "none";
export type StoredEmailSettings = {
  enabled: boolean;
  host: string;
  port: number;
  security: EmailSecurity;
  user: string;
  /** Encrypted with lib/crypto.ts; empty when the server needs no login. */
  password: string;
  fromName: string;
  fromAddress: string;
  /** Last site address an admin used, for links when SITE_URL is unset. */
  origin?: string;
};

/** What the dashboard form sees. */
export type EmailSettingsView = Omit<StoredEmailSettings, "password" | "origin"> & { hasPassword: boolean };

export const DEFAULT_EMAIL: StoredEmailSettings = {
  enabled: false,
  host: "",
  port: 587,
  security: "starttls",
  user: "",
  password: "",
  fromName: "",
  fromAddress: "",
};

export async function readEmailSettings(): Promise<StoredEmailSettings> {
  const [row] = await db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, "email"));
  return { ...DEFAULT_EMAIL, ...(row?.value as Partial<StoredEmailSettings> | undefined) };
}

export function emailView(settings: StoredEmailSettings): EmailSettingsView {
  const { password, origin, ...rest } = settings;
  void origin;
  return { ...rest, hasPassword: Boolean(password) };
}

/** Ready to send: switched on with a host and a sender. */
export const emailReady = (s: StoredEmailSettings) => s.enabled && Boolean(s.host && s.fromAddress);

export function smtpPassword(s: StoredEmailSettings): string | null {
  if (!s.password) return "";
  return decryptSecret(s.password);
}

const memory = globalThis as unknown as { __docskuSiteOrigin?: string };

/** Remembers the address the dashboard is reached at, for links in messages queued outside a request (the scheduler). */
export function rememberOrigin(origin: string | null | undefined) {
  if (!origin) return;
  try {
    const url = new URL(origin);
    if (url.hostname === "127.0.0.1" || url.hostname === "::1") return;
    memory.__docskuSiteOrigin = url.origin;
  } catch {
    /* ignore */
  }
}

/** Absolute base for links in emails and webhooks: SITE_URL, else the last address seen, else the one saved with the email settings. */
export async function siteOrigin(): Promise<string> {
  const configured = process.env.SITE_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  if (memory.__docskuSiteOrigin) return memory.__docskuSiteOrigin;
  const settings = await readEmailSettings();
  return settings.origin ?? "";
}
