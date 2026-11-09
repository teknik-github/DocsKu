import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { handleUpdate, type TgUpdate } from "@/lib/telegram/bot";
import { readTelegramSettings, telegramCredentials } from "@/lib/telegram/settings";

/**
 * Telegram webhook (registered by Pengaturan → Telegram). Only requests carrying
 * the secret given to setWebhook are accepted. Answers at once and handles the
 * update after the response, because an AI turn can take a minute and Telegram
 * re-sends updates it doesn't get a 200 for.
 */
export async function POST(request: Request) {
  const credentials = telegramCredentials(await readTelegramSettings());
  if (!credentials) return new Response(null, { status: 404 });
  const given = Buffer.from(request.headers.get("x-telegram-bot-api-secret-token") ?? "");
  const expected = Buffer.from(credentials.secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return new Response(null, { status: 401 });

  const raw = await request.text();
  if (raw.length > 64_000) return new Response(null, { status: 413 });
  let update: TgUpdate;
  try {
    update = JSON.parse(raw) as TgUpdate;
  } catch {
    return new Response(null, { status: 400 });
  }
  after(() => handleUpdate(update));
  return new Response(null, { status: 200 });
}
