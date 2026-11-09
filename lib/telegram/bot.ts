import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Role } from "@/db/schema";
import { allow } from "@/lib/auth/rate-limit";
import { can } from "@/lib/auth/permissions";
import { editablePageIds } from "@/lib/auth/page-access";
import { getAiConfig } from "@/lib/ai/config";
import { AI_PRESETS } from "@/lib/ai/presets";
import type { ProposalState } from "@/lib/ai/chat-types";
import { getOwnedConversation } from "@/lib/ai/conversations";
import { runChatTurn, startConversation } from "@/lib/ai/chat-turn";
import { applyEditProposal, createDraftFromStoredProposal, findProposal, recordProposal } from "@/lib/ai/proposal-actions";
import { AUDIT_FOCUS, auditPages, type AuditFocus } from "@/lib/ai/audit";
import { listReviewPages } from "@/lib/review";
import { setCommentStatus } from "@/lib/comments";
import { compareSections } from "@/lib/section-diff";
import { logActivity } from "@/lib/activity";
import { siteOrigin } from "@/lib/notifications/settings";
import { sendHtml, tg, type InlineButton, type InlineKeyboard } from "@/lib/telegram/api";
import { esc, excerpt, link, markdownToTelegram } from "@/lib/telegram/format";
import { readTelegramSettings, telegramCredentials } from "@/lib/telegram/settings";

/**
 * The Telegram bot (webhook updates from /api/telegram). A chat is linked to a
 * Docsku account with "/start <code>" (code from Profil → Telegram); everything
 * after that runs with that account's role and page access. Plain messages go to
 * AI Chat (same agent, stored as a conversation with source "telegram");
 * proposals come with buttons that create drafts or apply edits to drafts.
 * Nothing here ever publishes.
 */

type TgChat = { id: number; type: string };
type TgUser = { id: number; username?: string; first_name?: string };
export type TgUpdate = {
  update_id: number;
  message?: { message_id: number; chat: TgChat; from?: TgUser; text?: string };
  callback_query?: { id: string; from: TgUser; data?: string; message?: { message_id: number; chat: TgChat } };
};

type Linked = { id: string; name: string; role: Role; conversationId: string | null };
type Ctx = { token: string; chatId: string; origin: string };

const memory = globalThis as unknown as { __docskuTgSeen?: Set<number>; __docskuTgBusy?: Set<string> };
const seen = (memory.__docskuTgSeen ??= new Set());
const busy = (memory.__docskuTgBusy ??= new Set());

export const hashCode = (code: string) => createHash("sha256").update(code.trim().toUpperCase()).digest("hex");

async function linkedUser(chatId: string): Promise<Linked | null> {
  const [row] = await db
    .select({ id: schema.users.id, name: schema.users.name, role: schema.users.role, conversationId: schema.telegramLinks.conversationId })
    .from(schema.telegramLinks)
    .innerJoin(schema.users, eq(schema.users.id, schema.telegramLinks.userId))
    .where(eq(schema.telegramLinks.chatId, chatId));
  return row ?? null;
}

const send = (ctx: Ctx, html: string, keyboard?: InlineKeyboard) => sendHtml(ctx.token, ctx.chatId, html, keyboard);

/** A button whose action is stored server-side (callback data holds only the id). */
async function button(userId: string, text: string, payload: Record<string, unknown>): Promise<InlineButton> {
  const id = randomBytes(9).toString("base64url");
  await db.insert(schema.telegramActions).values({ id, userId, payload });
  return { text, callback_data: `a:${id}` };
}

const webButton = (text: string, path: string, origin: string): InlineButton | null => (origin.startsWith("https://") ? { text, url: `${origin}${path}` } : null);

const keyboard = (...rows: (InlineButton | null)[][]): InlineKeyboard => ({ inline_keyboard: rows.map((row) => row.filter((b): b is InlineButton => Boolean(b))).filter((row) => row.length) });

/* ----------------------------------------------------------------- entry -- */

export async function handleUpdate(update: TgUpdate): Promise<void> {
  if (typeof update.update_id !== "number" || seen.has(update.update_id)) return;
  seen.add(update.update_id);
  if (seen.size > 1000) seen.delete(seen.values().next().value as number);

  const settings = await readTelegramSettings();
  const credentials = telegramCredentials(settings);
  if (!credentials) return;
  const origin = (await siteOrigin()) || settings.origin || "";
  try {
    if (update.callback_query) await handleCallback(update.callback_query, { token: credentials.token, chatId: String(update.callback_query.message?.chat.id ?? update.callback_query.from.id), origin });
    else if (update.message) await handleMessage(update.message, { token: credentials.token, chatId: String(update.message.chat.id), origin });
  } catch (error) {
    console.error("[telegram]", error instanceof Error ? error.message : error);
  }
}

const HELP = (name: string) =>
  [
    `Halo ${esc(name)}! Kirim pesan apa saja untuk bertanya ke AI Chat dokumentasi, misalnya:`,
    "<i>“Tulis panduan instalasi untuk Windows”</i> atau <i>“Perbarui halaman FAQ dengan pertanyaan soal login”</i>.",
    "",
    "Usulan AI datang dengan tombol <b>Buat draf</b> / <b>Terapkan ke draf</b>. Tidak ada yang langsung terbit.",
    "",
    "<b>Perintah</b>",
    "/baru — mulai percakapan AI baru",
    "/cari kata — cari halaman",
    "/draf — draf dan perubahan saya",
    "/tinjau — halaman yang perlu ditinjau",
    "/audit [tinjau|tautan|kualitas|lama] — audit dokumentasi",
    "/komentar — komentar yang menunggu persetujuan",
    "/putus — putuskan akun dari chat ini",
  ].join("\n");

const NOT_LINKED = (origin: string) =>
  `Chat ini belum terhubung ke akun Docsku.\n\nBuka ${origin ? link("/admin/profile#telegram", "Profil → Telegram", origin) : "Profil → Telegram di dasbor"}, buat kode, lalu kirim <code>/start KODE</code> ke sini.`;

async function handleMessage(message: NonNullable<TgUpdate["message"]>, ctx: Ctx) {
  // Private chats only: a group would let everyone in it act as the linked person.
  if (message.chat.type !== "private") return;
  const text = message.text?.trim();
  if (!text) return void (await send(ctx, "Saat ini saya hanya membaca pesan teks."));
  const command = text.match(/^\/([a-zA-Z_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/);
  const name = command?.[1].toLowerCase();
  const arg = command?.[2]?.trim() ?? "";

  if (name === "start" && arg) return linkChat(arg, message.from, ctx);
  const user = await linkedUser(ctx.chatId);
  if (!user) return void (await send(ctx, NOT_LINKED(ctx.origin)));

  switch (name) {
    case undefined:
      return aiTurn(user, text, ctx);
    case "start":
    case "bantuan":
    case "help":
      return void (await send(ctx, HELP(user.name.split(" ")[0])));
    case "baru":
      await db.update(schema.telegramLinks).set({ conversationId: null }).where(eq(schema.telegramLinks.userId, user.id));
      return void (await send(ctx, "Percakapan baru dimulai. Kirim pertanyaan Anda."));
    case "cari":
      return searchCommand(user, arg, ctx);
    case "draf":
      return draftsCommand(user, ctx);
    case "tinjau":
      return reviewCommand(user, ctx);
    case "audit":
      return auditCommand(user, arg, ctx);
    case "komentar":
      return commentsCommand(user, ctx);
    case "putus":
      await db.update(schema.telegramLinks).set({ chatId: null, username: null, linkedAt: null, conversationId: null }).where(eq(schema.telegramLinks.userId, user.id));
      await logActivity({ user, action: "telegram.unlink", meta: { via: "telegram" } });
      return void (await send(ctx, "Akun Docsku sudah diputus dari chat ini. Hubungkan lagi kapan saja dari Profil → Telegram."));
    default:
      return void (await send(ctx, "Perintah tidak dikenal. Ketik /bantuan untuk daftar perintah."));
  }
}

async function linkChat(code: string, from: TgUser | undefined, ctx: Ctx) {
  if (!allow(`tg-link:${ctx.chatId}`, 5, 15 * 60_000)) return void (await send(ctx, "Terlalu banyak percobaan. Coba lagi nanti."));
  const [row] = await db
    .select({ userId: schema.telegramLinks.userId })
    .from(schema.telegramLinks)
    .where(and(eq(schema.telegramLinks.codeHash, hashCode(code)), sql`${schema.telegramLinks.codeExpiresAt} > now()`));
  if (!row) return void (await send(ctx, "Kode tidak valid atau sudah kedaluwarsa. Buat kode baru di Profil → Telegram."));
  await db.transaction(async (tx) => {
    // One chat belongs to one account.
    await tx.update(schema.telegramLinks).set({ chatId: null, linkedAt: null, conversationId: null }).where(eq(schema.telegramLinks.chatId, ctx.chatId));
    await tx
      .update(schema.telegramLinks)
      .set({ chatId: ctx.chatId, username: from?.username ?? from?.first_name ?? null, linkedAt: sql`now()`, codeHash: null, codeExpiresAt: null, conversationId: null })
      .where(eq(schema.telegramLinks.userId, row.userId));
  });
  const user = await linkedUser(ctx.chatId);
  if (!user) return;
  await logActivity({ user, action: "telegram.link", meta: { username: from?.username ?? null } });
  await send(ctx, `✅ Terhubung sebagai <b>${esc(user.name)}</b>.\n\n${HELP(user.name.split(" ")[0])}`);
}

/* -------------------------------------------------------------- AI Chat -- */

async function aiTurn(user: Linked, text: string, ctx: Ctx) {
  if (busy.has(ctx.chatId)) return void (await send(ctx, "Masih mengerjakan pesan sebelumnya. Tunggu sebentar."));
  if (!allow(`ai:${user.id}`, 30, 60_000)) return void (await send(ctx, "Terlalu banyak permintaan AI. Tunggu sebentar."));
  const config = await getAiConfig();
  if (!config.enabled || (!config.apiKey && AI_PRESETS[config.provider].needsKey)) return void (await send(ctx, "AI belum diaktifkan di Pengaturan situs."));

  busy.add(ctx.chatId);
  const typing = () => tg(ctx.token, "sendChatAction", { chat_id: ctx.chatId, action: "typing" }).catch(() => {});
  void typing();
  const timer = setInterval(typing, 4500);
  try {
    let conversation = user.conversationId ? await getOwnedConversation(user.conversationId, user.id) : null;
    if (!conversation) {
      conversation = await startConversation(user, text, { source: "telegram" });
      await db.update(schema.telegramLinks).set({ conversationId: conversation.id }).where(eq(schema.telegramLinks.userId, user.id));
    }
    const reply = await runChatTurn({ user, config, conversation, message: text.slice(0, 20_000), emit: () => {}, signal: AbortSignal.timeout(5 * 60_000) });
    clearInterval(timer);
    const chunks = reply.content.trim() ? markdownToTelegram(reply.content, ctx.origin) : [];
    for (const chunk of chunks) await send(ctx, chunk);
    if (reply.error) await send(ctx, `⚠️ ${esc(reply.error)}`);
    for (const proposal of reply.proposals) await sendProposal(user, conversation.id, reply.id, proposal, ctx);
    if (!chunks.length && !reply.error && !reply.proposals.length) await send(ctx, "AI tidak memberi jawaban. Coba ulangi dengan kata lain.");
  } finally {
    clearInterval(timer);
    busy.delete(ctx.chatId);
  }
}

function changeSummary(proposal: ProposalState): string {
  if (proposal.contentMode === "append") return "Menambahkan isi di akhir halaman.";
  if (!proposal.baseMarkdown || !proposal.contentMarkdown) return "Mengganti isi halaman.";
  const rows = compareSections(proposal.baseMarkdown, proposal.contentMarkdown).filter((row) => row.status !== "same");
  if (!rows.length) return "Isi tidak berubah.";
  const label = { changed: "diubah", added: "baru", removed: "dihapus", same: "" } as const;
  return rows
    .slice(0, 8)
    .map((row) => `• ${esc(row.heading || "Pembuka")} <i>(${label[row.status]})</i>`)
    .concat(rows.length > 8 ? [`• … ${rows.length - 8} bagian lain`] : [])
    .join("\n");
}

async function sendProposal(user: Linked, conversationId: string, messageId: string, proposal: ProposalState, ctx: Ctx) {
  const ref = { c: conversationId, m: messageId, p: proposal.id, group: `${messageId}:${proposal.id}` };
  const web = webButton("Buka di web", `/admin/ai?c=${conversationId}`, ctx.origin);
  if (proposal.kind === "new") {
    const words = (proposal.contentMarkdown ?? "").split(/\s+/).filter(Boolean).length;
    const html = [
      "📄 <b>Usulan halaman baru</b>",
      `<b>${esc(proposal.title ?? "Tanpa judul")}</b>`,
      proposal.description ? esc(proposal.description) : null,
      proposal.section ? `<i>Kategori: ${esc(proposal.section)}</i>` : null,
      proposal.note ? `\n${esc(proposal.note)}` : null,
      proposal.contentMarkdown ? `\n<blockquote>${esc(excerpt(proposal.contentMarkdown, 600))}</blockquote>` : null,
      `<i>±${words} kata</i>`,
    ]
      .filter((line) => line !== null)
      .join("\n");
    const markup = keyboard(
      [await button(user.id, "📝 Buat draf", { kind: "proposal", op: "draft", ...ref }), await button(user.id, "Abaikan", { kind: "proposal", op: "dismiss", ...ref })],
      [web],
    );
    return void (await send(ctx, html, markup));
  }
  if (!proposal.target) return void (await send(ctx, "✏️ Usulan perubahan ini hanya bisa diterapkan dari editor halaman di web."));
  const html = [
    `✏️ <b>Usulan perubahan</b> untuk <b>${esc(proposal.target.title)}</b>`,
    proposal.note ? esc(proposal.note) : null,
    "",
    changeSummary(proposal),
    "",
    "<i>Diterapkan ke draf halaman (belum terbit). Versi sekarang disimpan di Riwayat revisi.</i>",
  ]
    .filter((line) => line !== null)
    .join("\n");
  const markup = keyboard(
    [await button(user.id, "✅ Terapkan ke draf", { kind: "proposal", op: "apply", ...ref }), await button(user.id, "Abaikan", { kind: "proposal", op: "dismiss", ...ref })],
    [webButton("Lihat perbedaan", `/admin/ai?c=${conversationId}`, ctx.origin)],
  );
  await send(ctx, html, markup);
}

/* ------------------------------------------------------------- buttons -- */

async function handleCallback(query: NonNullable<TgUpdate["callback_query"]>, ctx: Ctx) {
  const answer = (text: string) => tg(ctx.token, "answerCallbackQuery", { callback_query_id: query.id, text: text.slice(0, 190) }).catch(() => {});
  const id = query.data?.startsWith("a:") ? query.data.slice(2) : null;
  const user = await linkedUser(ctx.chatId);
  if (!id || !user) return void (await answer("Chat ini belum terhubung ke akun Docsku."));
  const [action] = await db.select().from(schema.telegramActions).where(eq(schema.telegramActions.id, id));
  if (!action || action.userId !== user.id) return void (await answer("Tombol ini tidak berlaku lagi."));
  if (action.usedAt) return void (await answer("Sudah diproses."));
  const payload = action.payload as Record<string, string>;

  // Claim the action (and its siblings, e.g. "Abaikan" next to "Buat draf") so a double tap runs once.
  const group = payload.group ?? id;
  const claimed = await db
    .update(schema.telegramActions)
    .set({ usedAt: sql`now()` })
    .where(and(eq(schema.telegramActions.userId, user.id), isNull(schema.telegramActions.usedAt), or(eq(schema.telegramActions.id, id), sql`${schema.telegramActions.payload}->>'group' = ${group}`)))
    .returning({ id: schema.telegramActions.id });
  if (!claimed.some((row) => row.id === id)) return void (await answer("Sudah diproses."));

  const result = await runAction(user, payload, ctx);
  if (!result.ok) {
    // Let the person try again.
    await db.update(schema.telegramActions).set({ usedAt: null }).where(inArray(schema.telegramActions.id, claimed.map((row) => row.id)));
    await answer(result.error);
    return void (await send(ctx, `⚠️ ${esc(result.error)}`));
  }
  await answer(result.toast);
  if (query.message) await tg(ctx.token, "editMessageReplyMarkup", { chat_id: ctx.chatId, message_id: query.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => {});
  if (result.html) await send(ctx, result.html);
}

type ActionResult = { ok: true; toast: string; html?: string } | { ok: false; error: string };

async function runAction(user: Linked, payload: Record<string, string>, ctx: Ctx): Promise<ActionResult> {
  if (payload.kind === "proposal") {
    const { c, m, p } = payload;
    if (payload.op === "dismiss") {
      const proposal = await findProposal(user.id, c, m, p);
      if (!proposal) return { ok: false, error: "Usulan tidak ditemukan." };
      if (proposal.status) return { ok: false, error: "Usulan ini sudah diproses." };
      await recordProposal(user.id, c, m, p, { status: "dismissed" });
      return { ok: true, toast: "Usulan diabaikan." };
    }
    if (payload.op === "draft") {
      const result = await createDraftFromStoredProposal(user, c, m, p);
      if (!result.ok) return result;
      return { ok: true, toast: "Draf dibuat.", html: `📝 Draf <b>${esc(result.title)}</b> dibuat. ${link(`/admin/pages/${result.pageId}`, "Buka di editor", ctx.origin)}` };
    }
    if (payload.op === "apply") {
      const result = await applyEditProposal(user, c, m, p, undefined, "telegram");
      if (!result.ok) return result;
      return {
        ok: true,
        toast: "Diterapkan ke draf.",
        html: `✅ Perubahan diterapkan ke draf <b>${esc(result.title)}</b> (belum terbit). ${link(`/admin/pages/${result.pageId}`, "Periksa & terbitkan di editor", ctx.origin)}`,
      };
    }
  }
  if (payload.kind === "comment") {
    if (!can(user, "comments.moderate")) return { ok: false, error: "Anda tidak boleh memoderasi komentar." };
    const status = payload.op === "approve" ? "approved" : payload.op === "spam" ? "spam" : null;
    if (!status) return { ok: false, error: "Tindakan tidak dikenal." };
    const [comment] = await db.select({ id: schema.pageComments.id }).from(schema.pageComments).where(eq(schema.pageComments.id, payload.id));
    if (!comment) return { ok: false, error: "Komentar sudah tidak ada." };
    await setCommentStatus([comment.id], status);
    await logActivity({ user, action: "comment.moderate", target: { type: "comment" }, meta: { status, count: 1, via: "telegram" } });
    return { ok: true, toast: status === "approved" ? "Komentar disetujui." : "Ditandai spam.", html: status === "approved" ? "✅ Komentar disetujui." : "🚫 Komentar ditandai spam." };
  }
  return { ok: false, error: "Tindakan tidak dikenal." };
}

/** Buttons for a notification (comment moderation), made per recipient at queue time. */
export async function commentButtons(userId: string, commentId: string): Promise<InlineKeyboard> {
  const group = `comment:${commentId}:${randomBytes(4).toString("hex")}`;
  return keyboard([
    await button(userId, "✅ Setujui", { kind: "comment", op: "approve", id: commentId, group }),
    await button(userId, "🚫 Spam", { kind: "comment", op: "spam", id: commentId, group }),
  ]);
}

/* ------------------------------------------------------------ commands -- */

const STATUS: Record<string, string> = { draft: "Draf", scheduled: "Terjadwal", published: "Terbit" };

async function visiblePages<T extends { id: string; status: string; visibility: string }>(user: Linked, rows: T[]): Promise<T[]> {
  if (can(user, "pages.editAny")) return rows;
  const editable = new Set(await editablePageIds(user, rows.map((row) => row.id)));
  return rows.filter((row) => editable.has(row.id) || (row.status === "published" && row.visibility === "public"));
}

async function searchCommand(user: Linked, query: string, ctx: Ctx) {
  const words = query.split(/\s+/).filter(Boolean).slice(0, 6);
  if (!words.length) return void (await send(ctx, "Tulis kata kuncinya, misalnya <code>/cari instalasi</code>."));
  const p = schema.pages;
  const match = words.map((word) => {
    const term = `%${word.replace(/[%_\\]/g, "\\$&")}%`;
    return or(ilike(p.draftTitle, term), ilike(p.title, term), ilike(p.draftDescription, term), ilike(p.slug, term));
  });
  const rows = await db
    .select({ id: p.id, title: p.draftTitle, slug: p.slug, status: p.status, visibility: p.visibility, hasChanges: p.hasChanges })
    .from(p)
    .where(and(eq(p.kind, "doc"), ...match))
    .orderBy(desc(p.updatedAt))
    .limit(40);
  const found = (await visiblePages(user, rows)).slice(0, 10);
  if (!found.length) return void (await send(ctx, `Tidak ada halaman yang cocok dengan “${esc(query)}”. Mau dibuatkan? Kirim pesan seperti “Tulis halaman tentang ${esc(query)}”.`));
  const lines = found.map((row) => {
    const live = row.status === "published" && row.visibility === "public" ? ` · ${link(`/docs/${row.slug}`, "lihat", ctx.origin)}` : "";
    return `• ${link(`/admin/pages/${row.id}`, row.title || "Tanpa judul", ctx.origin)} — ${STATUS[row.status] ?? row.status}${row.hasChanges ? " (ada perubahan)" : ""}${row.visibility === "internal" ? " · internal" : ""}${live}`;
  });
  await send(ctx, `<b>Hasil untuk “${esc(query)}”</b>\n${lines.join("\n")}`);
}

async function draftsCommand(user: Linked, ctx: Ctx) {
  const p = schema.pages;
  const rows = await db
    .select({ id: p.id, title: p.draftTitle, status: p.status, hasChanges: p.hasChanges, approval: p.approvalStatus, note: p.approvalNote })
    .from(p)
    .where(and(eq(p.kind, "doc"), or(eq(p.authorId, user.id), eq(p.ownerId, user.id), and(isNull(p.authorId), eq(p.updatedById, user.id))), or(eq(p.status, "draft"), eq(p.hasChanges, true))))
    .orderBy(desc(p.updatedAt))
    .limit(10);
  const lines = rows.map((row) => {
    const state =
      row.approval === "pending" ? "menunggu persetujuan" : row.approval === "changes_requested" ? "perlu diperbaiki" : row.status === "draft" ? "draf" : "perubahan belum terbit";
    return `• ${link(`/admin/pages/${row.id}`, row.title || "Tanpa judul", ctx.origin)} — ${state}${row.approval === "changes_requested" && row.note ? `\n  <i>${esc(row.note.slice(0, 200))}</i>` : ""}`;
  });
  const parts = [lines.length ? `<b>Draf dan perubahan Anda</b>\n${lines.join("\n")}` : "Tidak ada draf atau perubahan yang belum terbit."];
  if (can(user, "pages.approve")) {
    const [pending] = await db.select({ n: sql<number>`count(*)::int` }).from(p).where(eq(p.approvalStatus, "pending"));
    if (pending?.n) parts.push(`📥 ${pending.n} halaman menunggu persetujuan: ${link("/admin/pages?persetujuan=1", "buka antrean", ctx.origin)}`);
  }
  await send(ctx, parts.join("\n\n"));
}

async function reviewCommand(user: Linked, ctx: Ctx) {
  const staff = can(user, "review.manage");
  const rows = (await listReviewPages({ userId: user.id, mine: !staff })).slice(0, 12);
  if (!rows.length) return void (await send(ctx, staff ? "Tidak ada halaman yang perlu ditinjau dalam 14 hari ke depan." : "Tidak ada halaman Anda yang perlu ditinjau dalam 14 hari ke depan."));
  const lines = rows.map((row) => `• ${link(`/admin/pages/${row.id}`, row.title, ctx.origin)} — ${row.days < 0 ? `lewat ${-row.days} hari` : row.days === 0 ? "hari ini" : `${row.days} hari lagi`}${staff && row.ownerName ? ` · ${esc(row.ownerName)}` : ""}`);
  await send(ctx, `<b>Perlu ditinjau${staff ? "" : " (halaman Anda)"}</b>\n${lines.join("\n")}\n\nMinta AI membantu: kirim “Tinjau halaman &lt;judul&gt; dan perbarui yang usang”.`);
}

const AUDIT_WORDS: Record<string, AuditFocus> = { tinjau: "review_due", tinjauan: "review_due", tautan: "broken_links", link: "broken_links", kualitas: "low_quality", lama: "stale", usang: "stale", semua: "all" };

async function auditCommand(user: Linked, arg: string, ctx: Ctx) {
  const word = arg.toLowerCase().split(/\s+/)[0] ?? "";
  const focus: AuditFocus = AUDIT_WORDS[word] ?? ((AUDIT_FOCUS as readonly string[]).includes(word) ? (word as AuditFocus) : "all");
  void tg(ctx.token, "sendChatAction", { chat_id: ctx.chatId, action: "typing" }).catch(() => {});
  const findings = await auditPages(user, focus, 8);
  if (!findings.length) return void (await send(ctx, "Tidak ada temuan. Dokumentasi Anda dalam kondisi baik untuk fokus ini."));
  const lines = findings.map((finding) => {
    const notes = [
      finding.reviewOverdueDays !== undefined ? `tinjauan lewat ${finding.reviewOverdueDays} hari` : null,
      finding.brokenLinks?.length ? `${finding.brokenLinks.length} tautan rusak` : null,
      finding.quality ? `skor kualitas ${finding.quality.score}` : null,
      focus === "stale" ? `diubah ${finding.daysSinceUpdate} hari lalu` : null,
    ].filter(Boolean);
    return `• <b>${esc(finding.title)}</b> (${link(`/docs/${finding.slug}`, `/docs/${finding.slug}`, ctx.origin)})${notes.length ? `\n  ${notes.join(" · ")}` : ""}${finding.quality?.issues[0] ? `\n  <i>${esc(finding.quality.issues[0])}</i>` : ""}`;
  });
  await send(ctx, `<b>Audit dokumentasi</b>\n${lines.join("\n")}\n\nMinta AI memperbaiki: kirim “Perbaiki halaman &lt;judul&gt; berdasarkan audit”.`);
}

async function commentsCommand(user: Linked, ctx: Ctx) {
  if (!can(user, "comments.moderate")) return void (await send(ctx, "Moderasi komentar hanya untuk editor dan admin."));
  const c = schema.pageComments;
  const rows = await db
    .select({ id: c.id, author: c.authorName, body: c.body, page: schema.pages.title, slug: schema.pages.slug, createdAt: c.createdAt })
    .from(c)
    .innerJoin(schema.pages, eq(schema.pages.id, c.pageId))
    .where(eq(c.status, "pending"))
    .orderBy(desc(c.createdAt))
    .limit(5);
  const [total] = await db.select({ n: sql<number>`count(*)::int` }).from(c).where(eq(c.status, "pending"));
  if (!rows.length) return void (await send(ctx, "Tidak ada komentar yang menunggu persetujuan."));
  await send(ctx, `<b>${total?.n ?? rows.length} komentar menunggu persetujuan</b>${(total?.n ?? 0) > rows.length ? ` (5 terbaru; semua di ${link("/admin/comments?view=pending", "Komentar", ctx.origin)})` : ""}`);
  for (const row of rows) {
    await send(
      ctx,
      `💬 <b>${esc(row.author)}</b> di ${link(`/docs/${row.slug}#komentar`, row.page, ctx.origin)}\n<blockquote>${esc(row.body.slice(0, 600))}</blockquote>`,
      await commentButtons(user.id, row.id),
    );
  }
}
