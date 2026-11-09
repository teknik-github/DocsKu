"use server";

import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { JSONContent } from "@tiptap/core";
import { z } from "zod";
import { db, schema } from "@/db";
import { authorize } from "@/lib/auth/dal";
import { getAiConfig } from "@/lib/ai/config";
import { AiError, listModels } from "@/lib/ai/client";
import { AI_PRESETS } from "@/lib/ai/presets";
import type { ChatMessage, Conversation, ConversationListItem, ProposalState } from "@/lib/ai/chat-types";
import { MODEL_PATTERN, compactIfNeeded, getOwnedConversation } from "@/lib/ai/conversations";
import { can } from "@/lib/auth/permissions";
import { canEditPage, editablePageIds } from "@/lib/auth/page-access";
import { mdxToDoc } from "@/lib/content/mdx-to-doc";
import { addRevision, draftSchema, saveWorkingCopy } from "@/lib/pages/service";
import { logActivity } from "@/lib/activity";

const isId = (id: unknown): id is string => z.uuid().safeParse(id).success;
const owned = (id: string, userId: string) =>
  and(eq(schema.aiConversations.id, id), eq(schema.aiConversations.userId, userId));

/** The signed-in user's chats, newest first; only one page's chats when `pageId` is given. */
export async function listConversations(pageId?: string | null): Promise<ConversationListItem[]> {
  const user = await authorize("any");
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
      pinned: schema.aiConversations.pinned,
      messageCount: sql<number>`jsonb_array_length(${schema.aiConversations.messages})`,
    })
    .from(schema.aiConversations)
    .leftJoin(schema.pages, eq(schema.aiConversations.pageId, schema.pages.id))
    .where(and(...filters))
    .orderBy(desc(schema.aiConversations.pinned), desc(schema.aiConversations.updatedAt))
    .limit(200);
  return rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString(), messageCount: Number(row.messageCount) }));
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const user = await authorize("any");
  if ("error" in user || !isId(id)) return null;
  return getOwnedConversation(id, user.id);
}

export async function renameConversation(id: string, title: string) {
  const user = await authorize("any");
  if ("error" in user || !isId(id)) return { ok: false as const };
  const clean = title.replace(/\s+/g, " ").trim().slice(0, 120);
  if (!clean) return { ok: false as const };
  await db.update(schema.aiConversations).set({ title: clean }).where(owned(id, user.id));
  return { ok: true as const };
}

export async function deleteConversation(id: string) {
  const user = await authorize("any");
  if ("error" in user || !isId(id)) return { ok: false as const };
  await db.delete(schema.aiConversations).where(owned(id, user.id));
  return { ok: true as const };
}

export async function setConversationModel(id: string, model: string | null) {
  const user = await authorize("any");
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
  const user = await authorize("any");
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
  const user = await authorize("any");
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
  const user = await authorize("any");
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

/**
 * "Coba lagi" / "Edit": drops a user message and everything after it, so it can
 * be sent again. Messages already folded into the summary can't be changed.
 */
export async function truncateConversation(id: string, fromMessageId: string) {
  const user = await authorize("any");
  if ("error" in user || !isId(id)) return { ok: false as const, error: "Percakapan tidak ditemukan." };
  const conversation = await getOwnedConversation(id, user.id);
  if (!conversation) return { ok: false as const, error: "Percakapan tidak ditemukan." };
  const index = conversation.messages.findIndex((m) => m.id === fromMessageId);
  if (index < 0 || conversation.messages[index].role !== "user") return { ok: false as const, error: "Pesan tidak ditemukan." };
  if (index < conversation.compactedCount) return { ok: false as const, error: "Pesan ini sudah diringkas dan tidak bisa diubah lagi." };
  await db.update(schema.aiConversations).set({ messages: conversation.messages.slice(0, index) }).where(owned(id, user.id));
  return { ok: true as const };
}

export async function setConversationPinned(id: string, pinned: boolean) {
  const user = await authorize("any");
  if ("error" in user || !isId(id)) return { ok: false as const };
  // Pinning isn't new activity: keep the chat's place by date.
  await db
    .update(schema.aiConversations)
    .set({ pinned: Boolean(pinned), updatedAt: sql`${schema.aiConversations.updatedAt}` })
    .where(owned(id, user.id));
  return { ok: true as const };
}

/** "@" in the chat box: doc pages by title or slug that this person may attach. */
export async function searchPagesForMention(query: string): Promise<{ id: string; title: string; slug: string; status: string }[]> {
  const user = await authorize("any");
  if ("error" in user) return [];
  const q = String(query ?? "").trim().slice(0, 80);
  const term = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
  const rows = await db
    .select({ id: schema.pages.id, title: schema.pages.draftTitle, slug: schema.pages.slug, status: schema.pages.status, visibility: schema.pages.visibility })
    .from(schema.pages)
    .where(and(eq(schema.pages.kind, "doc"), q ? or(ilike(schema.pages.draftTitle, term), ilike(schema.pages.slug, term)) : undefined))
    .orderBy(desc(schema.pages.updatedAt))
    .limit(30);
  const editable = can(user, "pages.editAny") ? null : new Set(await editablePageIds(user, rows.map((row) => row.id)));
  return rows
    .filter((row) => !editable || editable.has(row.id) || (row.status === "published" && row.visibility === "public"))
    .slice(0, 8)
    .map(({ id, title, slug, status }) => ({ id, title: title || "Tanpa judul", slug, status }));
}

/** Markdown/MDX → editor JSON, for applying only some sections of a proposed edit in the open editor. */
export async function convertProposalMarkdown(markdown: string): Promise<JSONContent | null> {
  const user = await authorize("any");
  if ("error" in user || typeof markdown !== "string" || markdown.length > 200_000) return null;
  return mdxToDoc(markdown);
}

/**
 * Applies an edit proposal for a page other than the one open in the editor (audits, /admin/ai):
 * the stored proposal (never the client's copy) goes into that page's working copy, after
 * keeping the current one as an "ai-edit" revision. `contentMarkdown` replaces the proposed
 * body when the person applied only some sections. Nothing is published.
 */
export async function applyProposalToPage(
  conversationId: string,
  messageId: string,
  proposalId: string,
  override?: { contentMarkdown?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await authorize("any");
  if ("error" in user) return { ok: false, error: user.error };
  if (!isId(conversationId)) return { ok: false, error: "Percakapan tidak ditemukan." };
  const conversation = await getOwnedConversation(conversationId, user.id);
  const message = conversation?.messages.find((m) => m.id === messageId);
  const proposal = message?.role === "assistant" ? message.proposals.find((p) => p.id === proposalId) : undefined;
  if (!proposal || proposal.kind !== "edit" || !proposal.target) return { ok: false, error: "Usulan tidak ditemukan." };
  if (proposal.status === "applied") return { ok: false, error: "Usulan ini sudah diterapkan." };
  if (!(await canEditPage(user, proposal.target.id))) return { ok: false, error: "Anda tidak boleh mengubah halaman ini." };
  const [page] = await db
    .select({ title: schema.pages.draftTitle, description: schema.pages.draftDescription, content: schema.pages.draftContent, seo: schema.pages.draftSeo, cover: schema.pages.draftCoverImage })
    .from(schema.pages)
    .where(eq(schema.pages.id, proposal.target.id));
  if (!page) return { ok: false, error: "Halaman sudah tidak ada." };

  const markdown = typeof override?.contentMarkdown === "string" ? override.contentMarkdown.slice(0, 200_000) : proposal.contentMarkdown;
  const body = markdown ? mdxToDoc(markdown) : null;
  const content =
    !body ? page.content : proposal.contentMode === "append" ? { ...page.content, content: [...(page.content.content ?? []), ...(body.content ?? [])] } : body;
  const parsed = draftSchema.safeParse({
    title: proposal.title ?? page.title,
    description: proposal.description ?? page.description,
    content,
    seo: { ...page.seo, ...(proposal.seo ?? {}) },
    cover: page.cover,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const before = draftSchema.parse({ title: page.title, description: page.description, content: page.content, seo: page.seo, cover: page.cover });
  await addRevision(proposal.target.id, before, "ai-edit", user.id);
  const saved = await saveWorkingCopy(proposal.target.id, parsed.data, user.id);
  if (!saved.ok) return { ok: false, error: "error" in saved ? saved.error : "Halaman sedang diubah orang lain. Coba lagi." };
  await logActivity({ user, action: "page.ai_edit", target: { type: "page", id: proposal.target.id, label: parsed.data.title }, meta: { via: "ai-chat" } });
  await updateProposal(conversationId, messageId, proposalId, { status: "applied" });
  return { ok: true };
}
