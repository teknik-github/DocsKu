import "server-only";

/**
 * Minimal Telegram Bot API client. Requests only ever go to api.telegram.org
 * (TELEGRAM_API_URL overrides it for the e2e suite's local fake). Errors never
 * include the token.
 */

export class TelegramError extends Error {
  constructor(
    message: string,
    readonly code: number | null,
  ) {
    super(message);
  }
}

const base = () => (process.env.TELEGRAM_API_URL || "https://api.telegram.org").replace(/\/+$/, "");

export async function tg<T = unknown>(token: string, method: string, body: Record<string, unknown> = {}, timeoutMs = 15_000): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${base()}/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (error) {
    const timeout = error instanceof Error && error.name === "TimeoutError";
    throw new TelegramError(timeout ? "Telegram tidak menjawab (waktu habis)." : "Tidak bisa terhubung ke Telegram.", null);
  }
  const data = (await response.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string; error_code?: number } | null;
  if (!data?.ok) {
    const description = (data?.description ?? `HTTP ${response.status}`).replace(/bot\d+:[A-Za-z0-9_-]+/g, "bot…").slice(0, 300);
    throw new TelegramError(description, data?.error_code ?? response.status);
  }
  return data.result as T;
}

export type InlineButton = { text: string; callback_data?: string; url?: string };
export type InlineKeyboard = { inline_keyboard: InlineButton[][] };

/** Sends HTML; when Telegram can't parse it, sends the same text without formatting. */
export async function sendHtml(token: string, chatId: string | number, html: string, replyMarkup?: InlineKeyboard) {
  const body = { chat_id: chatId, text: html, parse_mode: "HTML", link_preview_options: { is_disabled: true }, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) };
  try {
    return await tg<{ message_id: number }>(token, "sendMessage", body);
  } catch (error) {
    if (error instanceof TelegramError && error.code === 400 && /parse|entit|tag/i.test(error.message)) {
      const plain = html.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
      return tg<{ message_id: number }>(token, "sendMessage", { ...body, text: plain, parse_mode: undefined });
    }
    throw error;
  }
}

/** The commands shown in Telegram's menu. */
export const BOT_COMMANDS = [
  { command: "baru", description: "Mulai percakapan AI baru" },
  { command: "cari", description: "Cari halaman: /cari kata kunci" },
  { command: "draf", description: "Draf dan perubahan saya yang belum terbit" },
  { command: "tinjau", description: "Halaman yang perlu ditinjau" },
  { command: "audit", description: "Audit dokumentasi: /audit [tinjau|tautan|kualitas|lama]" },
  { command: "komentar", description: "Komentar yang menunggu persetujuan" },
  { command: "bantuan", description: "Daftar perintah" },
  { command: "putus", description: "Putuskan akun Docsku dari chat ini" },
];
