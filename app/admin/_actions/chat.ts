"use server";

import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { authorize } from "@/lib/auth/dal";
import { getAiConfig } from "@/lib/ai/config";
import { AiError, listModels } from "@/lib/ai/client";
import { AI_PRESETS } from "@/lib/ai/presets";
import type { ChatMessage, Conversation, ConversationListItem, ProposalState } from "@/lib/ai/chat-types";
import { MODEL_PATTERN, compactIfNeeded, getOwnedConversation } from "@/lib/ai/conversations";

const isId = (id: unknown): id is string => z.uuid().safeParse(id).success;
const owned = (id: string, userId: string) =>
  and(eq(schema.aiConversations.id, id), eq(schema.aiConversations.userId, userId));

/** The signed-in user's chats, newest first; only one page's chats when `pageId` is given. */
export async function listConversations(pageId?: string | null): Promise<ConversationListItem[]> {
  const user = await authorize();
  if ("error" in user) return [];
  const filters = [eq(schema.aiConversations.userId, user.id)];
  if (pageId) {
    if (!isId(pageId)) return [];
    filters.push(eq(schema.aiConversations.pageId, pageId));
  }
  const rows = await db
    .select({
      id: schema.aiConversations.id,
      title: schema.aiConversations.title,
      pageId: schema.aiConversations.pageId,
      pageTitle: schema.pages.draftTitle,
      updatedAt: schema.aiConversations.updatedAt,
      messageCount: sql<number>`jsonb_array_length(${schema.aiConversations.messages})`,
    })
    .from(schema.aiConversations)
    .leftJoin(schema.pages, eq(schema.aiConversations.pageId, schema.pages.id))
    .where(and(...filters))
    .orderBy(desc(schema.aiConversations.updatedAt))
    .limit(100);
  return rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString(), messageCount: Number(row.messageCount) }));
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const user = await authorize();
  if ("error" in user || !isId(id)) return null;
  return getOwnedConversation(id, user.id);
}

export async function renameConversation(id: string, title: string) {
  const user = await authorize();
  if ("error" in user || !isId(id)) return { ok: false as const };
  const clean = title.replace(/\s+/g, " ").trim().slice(0, 120);
  if (!clean) return { ok: false as const };
  await db.update(schema.aiConversations).set({ title: clean }).where(owned(id, user.id));
  return { ok: true as const };
}

export async function deleteConversation(id: string) {
  const user = await authorize();
  if ("error" in user || !isId(id)) return { ok: false as const };
  await db.delete(schema.aiConversations).where(owned(id, user.id));
  return { ok: true as const };
}

export async function setConversationModel(id: string, model: string | null) {
  const user = await authorize();
  if ("error" in user || !isId(id)) return { ok: false as const };
  if (model !== null && !MODEL_PATTERN.test(model)) return { ok: false as const };
  await db.update(schema.aiConversations).set({ model }).where(owned(id, user.id));
  return { ok: true as const };
}

/** Records what happened to a proposal (applied, dismissed, draft created) in the stored chat. */
export async function updateProposal(
  conversationId: string,
  messageId: string,
  proposalId: string,
  patch: Pick<ProposalState, "status" | "draftId" | "pageStatus" | "error">,
) {
  const user = await authorize();
  if ("error" in user || !isId(conversationId)) return { ok: false as const };
  const conversation = await getOwnedConversation(conversationId, user.id);
  if (!conversation) return { ok: false as const };
  const clean = {
    status: patch.status === "applied" || patch.status === "dismissed" ? patch.status : undefined,
    draftId: isId(patch.draftId) ? patch.draftId : undefined,
    pageStatus: patch.pageStatus === "draft" || patch.pageStatus === "published" || patch.pageStatus === "scheduled" ? patch.pageStatus : undefined,
    error: typeof patch.error === "string" ? patch.error.slice(0, 300) : undefined,
  };
  const messages: ChatMessage[] = conversation.messages.map((m) =>
    m.role === "assistant" && m.id === messageId
      ? { ...m, proposals: m.proposals.map((p) => (p.id === proposalId ? { ...p, ...clean } : p)) }
      : m,
  );
  // Keep the chat's position in the history list: this isn't new activity.
  await db
    .update(schema.aiConversations)
    .set({ messages, updatedAt: sql`${schema.aiConversations.updatedAt}` })
    .where(owned(conversationId, user.id));
  return { ok: true as const };
}

/** Summarises the older part of a chat now, instead of waiting for it to grow. */
export async function compactConversation(id: string) {
  const user = await authorize();
  if ("error" in user || !isId(id)) return { ok: false as const, error: "Percakapan tidak ditemukan." };
  const conversation = await getOwnedConversation(id, user.id);
  if (!conversation) return { ok: false as const, error: "Percakapan tidak ditemukan." };
  const config = await getAiConfig();
  try {
    const result = await compactIfNeeded({ ...config, model: conversation.model ?? config.model }, conversation, { force: true });
    if (!result) return { ok: false as const, error: "Percakapan masih terlalu pendek untuk diringkas." };
    await db.update(schema.aiConversations).set(result).where(owned(id, user.id));
    return { ok: true as const, ...result };
  } catch (error) {
    return { ok: false as const, error: error instanceof AiError ? error.message : "Gagal meringkas percakapan." };
  }
}

/** Models for the chat's model picker: detected from the provider, else the preset list. */
export async function listChatModels(): Promise<{ models: string[]; defaultModel: string }> {
  const user = await authorize();
  const config = await getAiConfig();
  const fallback = [...new Set([config.model, ...AI_PRESETS[config.provider].models].filter(Boolean))];
  if ("error" in user) return { models: fallback, defaultModel: config.model };
  try {
    const models = await listModels(config);
    return { models: models.length ? models : fallback, defaultModel: config.model };
  } catch {
    return { models: fallback, defaultModel: config.model };
  }
}
