import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Role } from "@/db/schema";
import type { AiConfig } from "@/lib/ai/config";
import { AiError } from "@/lib/ai/client";
import { runAgent, type AttachedPage } from "@/lib/ai/agent";
import type { AgentEvent, ChatMessage, Conversation, CurrentPage } from "@/lib/ai/chat-types";
import { compactIfNeeded, historyEntry, titleFrom, toConversation } from "@/lib/ai/conversations";
import { getSiteSettings } from "@/lib/data/site";
import { can } from "@/lib/auth/permissions";
import { editablePageIds } from "@/lib/auth/page-access";
import { toMarkdown } from "@/lib/content/markdown";
import { writingStyleText } from "@/lib/ai/style-server";

/**
 * One AI Chat turn, shared by the dashboard (/admin/api/agent, streamed) and the
 * Telegram bot: stores the user message, compacts the history when it grew,
 * runs the agent with this person's permissions, and stores the reply (even when
 * the request is aborted). Callers check auth, AI readiness and rate limits.
 */

export type TurnUser = { id: string; role: Role };
export type AssistantMessage = Extract<ChatMessage, { role: "assistant" }>;

async function save(id: string, patch: Partial<typeof schema.aiConversations.$inferInsert>) {
  await db.update(schema.aiConversations).set(patch).where(eq(schema.aiConversations.id, id));
}

export async function startConversation(user: TurnUser, firstMessage: string, options: { pageId?: string | null; model?: string | null; source?: "web" | "telegram" } = {}) {
  const [row] = await db
    .insert(schema.aiConversations)
    .values({ userId: user.id, pageId: options.pageId ?? null, title: titleFrom(firstMessage), model: options.model ?? null, source: options.source ?? "web" })
    .returning();
  return toConversation(row);
}

/** "@" attachments: the working copy of pages this person may read here (contributors: their own, or published public ones). */
async function loadAttachments(user: TurnUser, ids: string[]) {
  if (!ids.length) return { stored: [], pages: [] as AttachedPage[] };
  const rows = await db
    .select({
      id: schema.pages.id,
      slug: schema.pages.slug,
      title: schema.pages.draftTitle,
      content: schema.pages.draftContent,
      status: schema.pages.status,
      visibility: schema.pages.visibility,
    })
    .from(schema.pages)
    .where(and(inArray(schema.pages.id, ids), eq(schema.pages.kind, "doc")));
  const editable = can(user, "pages.editAny") ? null : new Set(await editablePageIds(user, rows.map((row) => row.id)));
  const allowed = rows.filter((row) => !editable || editable.has(row.id) || (row.status === "published" && row.visibility === "public"));
  return {
    stored: allowed.map((row) => ({ id: row.id, title: row.title || "Tanpa judul", slug: row.slug })),
    pages: allowed.map((row) => ({ title: row.title || "Tanpa judul", slug: row.slug, markdown: toMarkdown(row.content) })),
  };
}

export async function runChatTurn({
  user,
  config,
  conversation,
  message,
  attachmentIds = [],
  page = null,
  model: modelOverride,
  emit: forward,
  signal,
}: {
  user: TurnUser;
  config: AiConfig;
  conversation: Conversation;
  message: string;
  attachmentIds?: string[];
  page?: CurrentPage | null;
  /** undefined keeps the conversation's model; null resets it to the default. */
  model?: string | null;
  emit: (event: AgentEvent) => void;
  signal?: AbortSignal;
}): Promise<AssistantMessage> {
  const attached = await loadAttachments(user, attachmentIds);
  const model = modelOverride ?? conversation.model ?? config.model;
  const effective = { ...config, model };
  const now = new Date().toISOString();
  const userMessage: ChatMessage = {
    id: randomUUID(),
    role: "user",
    content: message,
    ...(attached.stored.length ? { attachments: attached.stored } : {}),
    createdAt: now,
  };
  const reply: AssistantMessage = { id: randomUUID(), role: "assistant", content: "", tools: [], proposals: [], model, createdAt: now };
  const messages = [...conversation.messages, userMessage];
  await save(conversation.id, { messages, ...(modelOverride !== undefined ? { model: modelOverride } : {}) });

  // Everything shown live is also recorded in the stored reply.
  const emit = (event: AgentEvent) => {
    if (event.t === "text") reply.content += event.v;
    if (event.t === "tool") reply.tools.push(event.label);
    if (event.t === "proposal") reply.proposals.push(event.proposal);
    if (event.t === "error") reply.error = event.v;
    if (event.t === "usage") reply.usage = event.usage;
    forward(event);
  };
  forward({ t: "conversation", id: conversation.id, title: conversation.title, userMessageId: userMessage.id, assistantMessageId: reply.id });

  let { summary, compactedCount } = conversation;
  try {
    const compacted = await compactIfNeeded(effective, { ...conversation, messages });
    if (compacted) {
      ({ summary, compactedCount } = compacted);
      await save(conversation.id, { summary, compactedCount });
      forward({ t: "compacted", summary: compacted.summary, count: compacted.compactedCount });
    }
  } catch {
    // Summarising is best effort; the chat continues with the full history.
  }

  const [site, style] = await Promise.all([getSiteSettings(), writingStyleText()]);
  try {
    await runAgent({
      config: effective,
      siteName: site.name,
      history: messages.slice(compactedCount).map(historyEntry).slice(-40),
      page,
      summary,
      emit,
      signal: signal ?? new AbortController().signal,
      user,
      attachments: attached.pages,
      style,
    });
  } catch (error) {
    if (!signal?.aborted) emit({ t: "error", v: error instanceof AiError ? error.message : "Terjadi kesalahan saat menghubungi AI." });
  } finally {
    if (signal?.aborted) reply.stopped = true;
    await save(conversation.id, { messages: [...messages, reply] }).catch(() => {});
  }
  return reply;
}
