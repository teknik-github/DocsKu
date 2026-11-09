/**
 * What can be notified, shared by the server and the dashboard forms (no
 * server-only imports here).
 */
import type { Role } from "@/db/schema";

export type EmailEventKey = "comment.new" | "feedback.new" | "page.submitted" | "page.approved" | "page.changes_requested" | "page.published" | "note.new" | "links.broken" | "digest.weekly";

export type EmailEventInfo = {
  key: EmailEventKey;
  label: string;
  description: string;
  /** Roles that receive it as team members (page owners/authors and requesters get theirs regardless). */
  roles: Role[];
  /** Roles that may switch it at all in Profil. */
  visibleTo: Role[];
  defaultOn: boolean;
  /** Also available as a personal Telegram message (for people who linked the bot). */
  telegram?: boolean;
};

export const EMAIL_EVENTS: EmailEventInfo[] = [
  {
    key: "comment.new",
    label: "Komentar baru",
    description: "Komentar pembaca, terutama yang menunggu persetujuan. Kontributor hanya untuk halaman miliknya.",
    roles: ["admin", "editor"],
    visibleTo: ["admin", "editor", "contributor"],
    defaultOn: true,
    telegram: true,
  },
  {
    key: "feedback.new",
    label: "Pesan pembaca",
    description: "Pesan yang ditulis pembaca setelah menilai halaman. Admin, plus pemilik atau penulis halamannya.",
    roles: ["admin"],
    visibleTo: ["admin", "editor", "contributor"],
    defaultOn: true,
    telegram: true,
  },
  {
    key: "page.submitted",
    label: "Halaman diajukan untuk ditinjau",
    description: "Kontributor mengajukan draf untuk disetujui.",
    roles: ["admin", "editor"],
    visibleTo: ["admin", "editor"],
    defaultOn: true,
    telegram: true,
  },
  {
    key: "page.approved",
    label: "Pengajuan saya disetujui",
    description: "Draf yang Anda ajukan disetujui dan terbit.",
    roles: [],
    visibleTo: ["admin", "editor", "contributor"],
    defaultOn: true,
    telegram: true,
  },
  {
    key: "page.changes_requested",
    label: "Pengajuan saya perlu diperbaiki",
    description: "Peninjau meminta perubahan pada draf yang Anda ajukan.",
    roles: [],
    visibleTo: ["admin", "editor", "contributor"],
    defaultOn: true,
    telegram: true,
  },
  {
    key: "note.new",
    label: "Catatan tim di halaman saya",
    description: "Catatan internal baru di halaman yang Anda tulis atau pegang, dan balasan di catatan yang Anda ikuti.",
    roles: [],
    visibleTo: ["admin", "editor", "contributor"],
    defaultOn: true,
    telegram: true,
  },
  {
    key: "links.broken",
    label: "Tautan rusak di halaman saya",
    description: "Hasil pemeriksaan tautan mingguan (Senin): tautan rusak di halaman yang Anda pegang atau tulis. Admin menerima ringkasan semua halaman.",
    roles: ["admin"],
    visibleTo: ["admin", "editor", "contributor"],
    defaultOn: true,
  },
  {
    key: "page.published",
    label: "Halaman baru terbit",
    description: "Setiap kali halaman terbit untuk pertama kali (termasuk yang terjadwal).",
    roles: ["admin", "editor", "contributor"],
    visibleTo: ["admin", "editor", "contributor"],
    defaultOn: false,
    telegram: true,
  },
  {
    key: "digest.weekly",
    label: "Ringkasan mingguan",
    description: "Senin pukul 08.00 WIB: halaman Anda yang perlu ditinjau, komentar yang belum dibalas, dan pencarian tanpa hasil.",
    roles: ["admin", "editor", "contributor"],
    visibleTo: ["admin", "editor", "contributor"],
    defaultOn: true,
  },
];

export function prefOn(prefs: Record<string, boolean> | null | undefined, key: EmailEventKey): boolean {
  const stored = prefs?.[key];
  if (typeof stored === "boolean") return stored;
  return EMAIL_EVENTS.find((e) => e.key === key)?.defaultOn ?? false;
}

/** Telegram preferences live next to the email ones as "tg:<event>"; same defaults. */
export function telegramPrefOn(prefs: Record<string, boolean> | null | undefined, key: EmailEventKey): boolean {
  const stored = prefs?.[`tg:${key}`];
  if (typeof stored === "boolean") return stored;
  return EMAIL_EVENTS.find((e) => e.key === key)?.defaultOn ?? false;
}

export type WebhookKind = "slack" | "discord" | "telegram" | "custom";
export const WEBHOOK_KINDS: { id: WebhookKind; label: string; hint: string }[] = [
  { id: "slack", label: "Slack", hint: "Incoming webhook: https://hooks.slack.com/services/…" },
  { id: "discord", label: "Discord", hint: "Webhook kanal: https://discord.com/api/webhooks/…" },
  { id: "telegram", label: "Telegram", hint: "Token bot dari @BotFather dan chat id (grup atau kanal)." },
  { id: "custom", label: "URL sendiri", hint: "POST JSON ke URL https Anda, ditandatangani HMAC-SHA256." },
];

export type WebhookEventKey = "page.published" | "page.submitted" | "page.approved" | "comment.new" | "feedback.new" | "note.new" | "links.broken" | "search.misses";
export const WEBHOOK_EVENTS: { key: WebhookEventKey; label: string }[] = [
  { key: "page.published", label: "Halaman terbit" },
  { key: "page.submitted", label: "Halaman diajukan" },
  { key: "page.approved", label: "Pengajuan disetujui" },
  { key: "comment.new", label: "Komentar baru" },
  { key: "feedback.new", label: "Pesan pembaca" },
  { key: "note.new", label: "Catatan tim (internal)" },
  { key: "links.broken", label: "Tautan rusak (pemeriksaan mingguan)" },
  { key: "search.misses", label: "Pencarian tanpa hasil (ringkasan harian)" },
];
export const WEBHOOK_EVENT_KEYS = WEBHOOK_EVENTS.map((e) => e.key) as [WebhookEventKey, ...WebhookEventKey[]];

/** Delays before retry n (after the first failure, the second, …); then the row is marked failed. */
export const RETRY_DELAYS_MIN = [1, 5, 30, 120, 720];
