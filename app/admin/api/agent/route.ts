import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { isSameOrigin } from "@/lib/auth/request";
import { readSessionUser } from "@/lib/auth/session";
import { allow } from "@/lib/auth/rate-limit";
import { getAiConfig } from "@/lib/ai/config";
import { AiError } from "@/lib/ai/client";
import { runAgent } from "@/lib/ai/agent";
import type { AgentEvent, ChatMessage, Conversation } from "@/lib/ai/chat-types";
import {
  MODEL_PATTERN,
  compactIfNeeded,
  getOwnedConversation,
  historyEntry,
  titleFrom,
  toConversation,
} from "@/lib/ai/conversations";
import { AI_PRESETS } from "@/lib/ai/presets";
import { getSiteSettings } from "@/lib/data/site";

const requestSchema = z.object({
  conversationId: z.uuid().nullable().optional(),
  message: z.string().trim().min(1).max(20_000),
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

async function save(id: string, patch: Partial<typeof schema.aiConversations.$inferInsert>) {
  await db.update(schema.aiConversations).set(patch).where(eq(schema.aiConversations.id, id));
}

/**
 * AI Chat. Stores the conversation server-side and streams newline-delimited
 * JSON events (see AgentEvent): the conversation id, auto-compaction notices,
 * text, tool activity, proposals for the user to apply, and errors.
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
    const [row] = await db
      .insert(schema.aiConversations)
      .values({ userId: user.id, pageId: page?.id ?? null, title: titleFrom(body.message), model: body.model ?? null })
      .returning();
    conversation = toConversation(row);
  }

  const model = body.model ?? conversation.model ?? config.model;
  const effective = { ...config, model };
  const now = new Date().toISOString();
  const userMessage: ChatMessage = { id: randomUUID(), role: "user", content: body.message, createdAt: now };
  const reply: Extract<ChatMessage, { role: "assistant" }> = {
    id: randomUUID(),
    role: "assistant",
    content: "",
    tools: [],
    proposals: [],
    model,
    createdAt: now,
  };
  const messages = [...conversation.messages, userMessage];
  await save(conversation.id, { messages, ...(body.model !== undefined ? { model: body.model } : {}) });

  const site = await getSiteSettings();
  const encoder = new TextEncoder();
  const current = conversation;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: AgentEvent) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      // Everything shown live is also recorded in the stored reply.
      const emit = (event: AgentEvent) => {
        if (event.t === "text") reply.content += event.v;
        if (event.t === "tool") reply.tools.push(event.label);
        if (event.t === "proposal") reply.proposals.push(event.proposal);
        if (event.t === "error") reply.error = event.v;
        if (event.t === "usage") reply.usage = event.usage;
        send(event);
      };
      send({ t: "conversation", id: current.id, title: current.title, userMessageId: userMessage.id, assistantMessageId: reply.id });

      let { summary, compactedCount } = current;
      try {
        const compacted = await compactIfNeeded(effective, { ...current, messages });
        if (compacted) {
          ({ summary, compactedCount } = compacted);
          await save(current.id, { summary, compactedCount });
          send({ t: "compacted", summary: compacted.summary, count: compacted.compactedCount });
        }
      } catch {
        // Summarising is best effort; the chat continues with the full history.
      }

      try {
        await runAgent({
          config: effective,
          siteName: site.name,
          history: messages.slice(compactedCount).map(historyEntry).slice(-40),
          page: body.page ?? null,
          summary,
          emit,
          signal: request.signal,
        });
      } catch (error) {
        if (!request.signal.aborted) {
          emit({ t: "error", v: error instanceof AiError ? error.message : "Terjadi kesalahan saat menghubungi AI." });
        }
      } finally {
        await save(current.id, { messages: [...messages, reply] }).catch(() => {});
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
