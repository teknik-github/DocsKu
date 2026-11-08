import { connection } from "next/server";
import { z } from "zod";
import { getAiConfig } from "@/lib/ai/config";
import { streamChat } from "@/lib/ai/client";
import { askedToday, askMessages, getAskCorpus, NO_ANSWER, recordAsk, retrieve, sourcesOf } from "@/lib/ai/ask";
import { cacheKey, getCached, setCached } from "@/lib/ai/response-cache";
import { getAskAiAvailable, getAskAiSettings, getLanguageSettings, getSiteSettings } from "@/lib/data/site";
import { readPublicJson } from "@/lib/reader";

/**
 * "Tanya AI" for visitors: answers a question from the published docs only.
 * Streams NDJSON: {"t":"sources","v":[…]} first, then {"t":"text","v":"…"}
 * chunks, or {"t":"miss"} when the docs don't cover it, or {"t":"error","v":"…"}.
 * Limits: per visitor per minute (behind TRUST_PROXY), per site per minute,
 * and per day (counted in ask_ai_queries, so restarts don't reset it).
 */

const MAX_TOKENS = 1000;
/** Questions per minute for the whole site, whoever asks. */
const GLOBAL_PER_MINUTE = 40;
const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|python|curl|wget|httpclient|axios|node-fetch/i;

const bodySchema = z.object({ question: z.string().trim().min(3).max(300), locale: z.string().max(20).optional() });
const fail = (error: string, status: number) => Response.json({ error }, { status, headers: { "cache-control": "no-store" } });

export async function POST(request: Request) {
  await connection();
  if (!(await getAskAiAvailable())) return fail("Tanya AI sedang tidak aktif.", 404);
  if (BOT.test(request.headers.get("user-agent") ?? "bot")) return fail("Tidak diizinkan.", 403);
  const settings = await getAskAiSettings();
  const input = await readPublicJson(request, bodySchema, "ask", { perIp: settings.perMinute, global: GLOBAL_PER_MINUTE, maxBody: 2048 });
  if ("response" in input) {
    return input.response.status === 429 ? fail("Terlalu banyak pertanyaan. Tunggu sebentar, lalu coba lagi.", 429) : input.response;
  }
  if ((await askedToday()) >= settings.dailyLimit) {
    return fail("Kuota Tanya AI hari ini sudah habis. Gunakan pencarian biasa, atau coba lagi besok.", 429);
  }

  const question = input.data.question.replace(/\s+/g, " ");
  const query = question.toLowerCase();
  // The reader's language (an enabled extra one), else the default: its pages answer, in its language.
  const languages = await getLanguageSettings();
  const language = languages.languages.find((l) => l.code === input.data.locale);
  const [corpus, site, aiConfig] = await Promise.all([getAskCorpus(language?.code), getSiteSettings(), getAiConfig()]);
  const chunks = retrieve(question, corpus);
  const sources = sourcesOf(chunks);
  // Public answers: short, factual, and never in (slower, pricier) thinking mode.
  const config = { ...aiConfig, thinking: false, temperature: 0.2 };
  const messages = askMessages(site.name, question, chunks, language?.label);
  const key = cacheKey(config, messages, MAX_TOKENS);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      let missed = chunks.length === 0;
      try {
        send({ t: "sources", v: sources });
        // Nothing in the docs matches: no need to ask the model.
        if (missed) return send({ t: "miss" });

        const cached = getCached(key);
        if (cached !== null) {
          missed = cached === NO_ANSWER;
          return send(missed ? { t: "miss" } : { t: "text", v: cached });
        }

        // Hold the start back until it can't be the "no answer" marker.
        let text = "";
        let released = false;
        for await (const part of streamChat(config, messages, { maxTokens: MAX_TOKENS, signal: request.signal })) {
          if (part.type !== "text") continue;
          text += part.text;
          if (released) {
            send({ t: "text", v: part.text });
            continue;
          }
          const head = text.trimStart();
          if (head.startsWith(NO_ANSWER)) {
            missed = true;
            break;
          }
          if (head.length >= NO_ANSWER.length || !NO_ANSWER.startsWith(head)) {
            released = true;
            send({ t: "text", v: head });
          }
        }
        if (!released && !missed) {
          const head = text.trim();
          missed = !head || NO_ANSWER.startsWith(head);
          if (!missed) send({ t: "text", v: head });
        }
        if (missed) send({ t: "miss" });
        if (!request.signal.aborted) setCached(key, missed ? NO_ANSWER : text.trim());
      } catch (error) {
        if (!request.signal.aborted) {
          // Provider details (balance, keys) are for the dashboard, not visitors.
          console.error("[ask] AI request failed:", error);
          send({ t: "error", v: "AI sedang tidak bisa menjawab. Coba lagi nanti, atau gunakan hasil pencarian." });
        }
      } finally {
        await recordAsk(query, missed).catch((error) => console.error("[ask] could not record:", error));
        try {
          controller.close();
        } catch {
          // The visitor already closed the search box.
        }
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
