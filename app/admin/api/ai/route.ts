import { z } from "zod";
import { isSameOrigin } from "@/lib/auth/request";
import { readSessionUser } from "@/lib/auth/session";
import { allow } from "@/lib/auth/rate-limit";
import { getAiConfig } from "@/lib/ai/config";
import { AiError, streamChat } from "@/lib/ai/client";
import { buildMessages } from "@/lib/ai/prompts";
import { cacheKey, getCached, setCached } from "@/lib/ai/response-cache";
import { AI_ACTIONS, AI_PRESETS } from "@/lib/ai/presets";

const requestSchema = z.object({
  action: z.enum(["write", "custom", "description", ...AI_ACTIONS.map((a) => a.id)] as [string, ...string[]]),
  instruction: z.string().trim().max(2000).optional(),
  selection: z.string().max(20_000).optional(),
  inline: z.boolean().optional(),
  title: z.string().max(500).optional(),
  description: z.string().max(1000).optional(),
  document: z.string().max(30_000).optional(),
  /** Skip the answer cache, e.g. for "Coba lagi". */
  fresh: z.boolean().optional(),
});

const json = (error: string, status: number) => Response.json({ error }, { status });

/**
 * Streams AI-written text for the editor as newline-delimited JSON:
 * {"t":"text","v":"…"} chunks, {"t":"thinking"} while the model reasons,
 * {"t":"usage",…} with token counts, {"t":"cached"} when the answer came from
 * the answer cache (no tokens used), and {"t":"error","v":"…"} on failure.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return json("Permintaan dari situs lain ditolak.", 403);
  const user = await readSessionUser();
  if (!user) return json("Sesi Anda berakhir. Silakan masuk lagi.", 401);
  if (!allow(`ai:${user.id}`, 30, 60_000)) return json("Terlalu banyak permintaan AI. Tunggu sebentar.", 429);

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json("Permintaan tidak valid.", 400);
  const req = parsed.data as z.infer<typeof requestSchema> & { action: Parameters<typeof buildMessages>[0]["action"] };
  if ((req.action === "write" || req.action === "custom") && !req.instruction) return json("Tulis instruksinya dulu.", 400);
  if (req.action !== "write" && req.action !== "description" && !req.selection?.trim()) return json("Pilih teks dulu.", 400);

  const config = await getAiConfig();
  if (!config.enabled) return json("AI Write belum diaktifkan di Pengaturan.", 400);
  if (!config.apiKey && AI_PRESETS[config.provider].needsKey) return json("API key AI belum diisi di Pengaturan.", 400);

  const messages = buildMessages(req);
  const maxTokens = req.action === "description" ? 200 : undefined;
  const key = cacheKey(config, messages, maxTokens);
  const cached = req.fresh ? null : getCached(key);
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      if (cached) {
        send({ t: "text", v: cached });
        send({ t: "cached" });
        controller.close();
        return;
      }
      let thinking = false;
      let text = "";
      try {
        for await (const part of streamChat(config, messages, { maxTokens, signal: request.signal })) {
          if (part.type === "usage") {
            send({ t: "usage", usage: part.usage });
          } else if (part.type === "reasoning") {
            if (!thinking) send({ t: "thinking" });
            thinking = true;
          } else {
            text += part.text;
            send({ t: "text", v: part.text });
          }
        }
        // Only complete answers are reused.
        if (text && !request.signal.aborted) setCached(key, text);
      } catch (error) {
        if (!request.signal.aborted) {
          send({ t: "error", v: error instanceof AiError ? error.message : "Terjadi kesalahan saat menghubungi AI." });
        }
      } finally {
        try {
          controller.close();
        } catch {
          // Client already went away.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
