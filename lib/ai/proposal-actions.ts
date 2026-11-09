import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Role } from "@/db/schema";
import type { ChatMessage, ProposalState } from "@/lib/ai/chat-types";
import { getOwnedConversation } from "@/lib/ai/conversations";
import { canEditPage } from "@/lib/auth/page-access";
import { mdxToDoc } from "@/lib/content/mdx-to-doc";
import { addRevision, createPageFromMarkdown, draftSchema, markdownPageSchema, saveWorkingCopy } from "@/lib/pages/service";
import { logActivity } from "@/lib/activity";

/**
 * What happens to an AI Chat proposal, for callers that already know who the
 * person is: the dashboard's server actions (session) and the Telegram bot
 * (linked chat). Always works from the **stored** proposal.
 */

export type ProposalUser = { id: string; role: Role; name: string };
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export async function findProposal(userId: string, conversationId: string, messageId: string, proposalId: string) {
  const conversation = await getOwnedConversation(conversationId, userId);
  const message = conversation?.messages.find((m) => m.id === messageId);
  return message?.role === "assistant" ? (message.proposals.find((p) => p.id === proposalId) ?? null) : null;
}

/** Records what happened to a proposal (applied, dismissed, draft created) in the stored chat. */
export async function recordProposal(
  userId: string,
  conversationId: string,
  messageId: string,
  proposalId: string,
  patch: Pick<ProposalState, "status" | "draftId" | "pageStatus" | "error">,
) {
  const conversation = await getOwnedConversation(conversationId, userId);
  if (!conversation) return false;
  const messages: ChatMessage[] = conversation.messages.map((m) =>
    m.role === "assistant" && m.id === messageId ? { ...m, proposals: m.proposals.map((p) => (p.id === proposalId ? { ...p, ...patch } : p)) } : m,
  );
  // Keep the chat's position in the history list: this isn't new activity.
  await db
    .update(schema.aiConversations)
    .set({ messages, updatedAt: sql`${schema.aiConversations.updatedAt}` })
    .where(and(eq(schema.aiConversations.id, conversationId), eq(schema.aiConversations.userId, userId)));
  return true;
}

/**
 * Applies an edit proposal that names its page (audits, /admin/ai, Telegram) to that
 * page's working copy, after keeping the current one as an "ai-edit" revision.
 * `contentMarkdown` replaces the proposed body when only some sections were chosen.
 * Nothing is published.
 */
export async function applyEditProposal(
  user: ProposalUser,
  conversationId: string,
  messageId: string,
  proposalId: string,
  override?: { contentMarkdown?: string },
  via = "ai-chat",
): Promise<Result<{ pageId: string; title: string }>> {
  const proposal = await findProposal(user.id, conversationId, messageId, proposalId);
  if (!proposal || proposal.kind !== "edit" || !proposal.target) return { ok: false, error: "Usulan tidak ditemukan." };
  if (proposal.status === "applied") return { ok: false, error: "Usulan ini sudah diterapkan." };
  if (proposal.status === "dismissed") return { ok: false, error: "Usulan ini sudah diabaikan." };
  if (!(await canEditPage(user, proposal.target.id))) return { ok: false, error: "Anda tidak boleh mengubah halaman ini." };
  const [page] = await db
    .select({ title: schema.pages.draftTitle, description: schema.pages.draftDescription, content: schema.pages.draftContent, seo: schema.pages.draftSeo, cover: schema.pages.draftCoverImage })
    .from(schema.pages)
    .where(eq(schema.pages.id, proposal.target.id));
  if (!page) return { ok: false, error: "Halaman sudah tidak ada." };

  const markdown = typeof override?.contentMarkdown === "string" ? override.contentMarkdown.slice(0, 200_000) : proposal.contentMarkdown;
  const body = markdown ? mdxToDoc(markdown) : null;
  const content = !body ? page.content : proposal.contentMode === "append" ? { ...page.content, content: [...(page.content.content ?? []), ...(body.content ?? [])] } : body;
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
  await logActivity({ user, action: "page.ai_edit", target: { type: "page", id: proposal.target.id, label: parsed.data.title }, meta: { via } });
  await recordProposal(user.id, conversationId, messageId, proposalId, { status: "applied" });
  return { ok: true, pageId: proposal.target.id, title: parsed.data.title };
}

/** "Buat draf" from a stored new-page proposal (the Telegram bot; the dashboard sends the proposal it shows). */
export async function createDraftFromStoredProposal(
  user: ProposalUser,
  conversationId: string,
  messageId: string,
  proposalId: string,
  via = "telegram",
): Promise<Result<{ pageId: string; title: string }>> {
  const proposal = await findProposal(user.id, conversationId, messageId, proposalId);
  if (!proposal || proposal.kind !== "new") return { ok: false, error: "Usulan tidak ditemukan." };
  if (proposal.status === "applied") return { ok: false, error: "Draf untuk usulan ini sudah dibuat." };
  if (proposal.status === "dismissed") return { ok: false, error: "Usulan ini sudah diabaikan." };
  const parsed = markdownPageSchema.safeParse({
    title: proposal.title ?? "",
    description: proposal.description,
    slug: proposal.slug,
    content: proposal.contentMarkdown ?? "",
    seo: proposal.seo ? { title: proposal.seo.title, description: proposal.seo.description } : undefined,
    section: proposal.section,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const page = await createPageFromMarkdown(parsed.data, user.id, "ai");
  await logActivity({ user, action: "page.create", target: { type: "page", id: page.id, label: parsed.data.title }, meta: { via } });
  await recordProposal(user.id, conversationId, messageId, proposalId, { status: "applied", draftId: page.id, pageStatus: "draft" });
  return { ok: true, pageId: page.id, title: parsed.data.title };
}
