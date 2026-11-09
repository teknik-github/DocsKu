import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { isSameOrigin } from "@/lib/auth/request";
import { readSessionUser } from "@/lib/auth/session";
import { allow } from "@/lib/auth/rate-limit";
import { getAiConfig } from "@/lib/ai/config";
import type { AgentEvent, Conversation } from "@/lib/ai/chat-types";
import { MODEL_PATTERN, getOwnedConversation } from "@/lib/ai/conversations";
import { AI_PRESETS } from "@/lib/ai/presets";
import { runChatTurn, startConversation } from "@/lib/ai/chat-turn";

const requestSchema = z.object({
  conversationId: z.uuid().nullable().optional(),
  message: z.string().trim().min(1).max(20_000),
  /** Pages attached with "@" (at most five). */
  attachments: z.array(z.uuid()).max(5).optional(),
  model: z.string().regex(MODEL_PATTERN).nullable().optional(),
  page: z
    .object({
      id: z.uuid(),
      kind: z.enum(["doc", "home"]),
      slug: z.string().max(200),
      status: z.string().max(20),
      title: z.string().max(200),
      description: z.string().max(500),
      seo: z.object({ title: z.string().optional(), description: z.string().optional(), image: z.string().optional(), noindex: z.boolean().optional() }),
      markdown: z.string().max(200_000),
    })
    .nullable()
    .optional(),
});

const json = (error: string, status: number) => Response.json({ error }, { status });

/**
 * AI Chat. Stores the conversation server-side and streams newline-delimited
 * JSON events (see AgentEvent): the conversation id, auto-compaction notices,
 * text, tool activity, proposals for the user to apply, and errors. The turn
 * itself is lib/ai/chat-turn.ts (shared with the Telegram bot).
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return json("Permintaan dari situs lain ditolak.", 403);
  const user = await readSessionUser();
  if (!user) return json("Sesi Anda berakhir. Silakan masuk lagi.", 401);
  if (!allow(`ai:${user.id}`, 30, 60_000)) return json("Terlalu banyak permintaan AI. Tunggu sebentar.", 429);

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json("Permintaan tidak valid.", 400);
  const body = parsed.data;

  const config = await getAiConfig();
  if (!config.enabled) return json("AI belum diaktifkan di Pengaturan.", 400);
  if (!config.apiKey && AI_PRESETS[config.provider].needsKey) return json("API key AI belum diisi di Pengaturan.", 400);

  // Load the conversation, or start one (linked to the page when opened from the editor).
  let conversation: Conversation | null;
  if (body.conversationId) {
    conversation = await getOwnedConversation(body.conversationId, user.id);
    if (!conversation) return json("Percakapan tidak ditemukan.", 404);
  } else {
    const [page] = body.page
      ? await db.select({ id: schema.pages.id }).from(schema.pages).where(eq(schema.pages.id, body.page.id))
      : [];
    conversation = await startConversation(user, body.message, { pageId: page?.id ?? null, model: body.model ?? null });
  }

  const encoder = new TextEncoder();
  const current = conversation;
  const stream = new ReadableStream({
    async start(controller) {
      try {
        await runChatTurn({
          user,
          config,
          conversation: current,
          message: body.message,
          attachmentIds: body.attachments ?? [],
          page: body.page ?? null,
          model: body.model,
          emit: (event: AgentEvent) => {
            try {
              controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
            } catch {
              // Client already went away; the reply is still stored.
            }
          },
          signal: request.signal,
        });
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
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
