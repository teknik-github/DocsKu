import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { AiConfig } from "@/lib/ai/config";
import { completeChat } from "@/lib/ai/client";
import type { ChatMessage, Conversation } from "@/lib/ai/chat-types";

/** Rough size of the history sent to the model before older messages are summarised. */
export const COMPACT_AT_CHARS = 40_000;
/** Most recent messages always sent word for word. */
export const KEEP_RECENT = 6;

export const MODEL_PATTERN = /^[\w.\-:/@]{1,200}$/;

export function titleFrom(text: string) {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > 60 ? `${line.slice(0, 57)}…` : line || "Percakapan baru";
}

/** What the model sees of a stored message: its text plus a note per proposal. */
export function historyEntry(message: ChatMessage): { role: "user" | "assistant"; content: string } {
  if (message.role === "user") return { role: "user", content: message.content };
  const notes = message.proposals.map((p) => {
    const what = p.kind === "new" ? `halaman baru “${p.title}”` : "perubahan halaman";
    const outcome =
      p.status === "applied"
        ? p.kind === "new"
          ? "pengguna membuatnya sebagai draf"
          : "pengguna menerapkannya"
        : p.status === "dismissed"
          ? "pengguna mengabaikannya"
          : "belum diputuskan";
    return `[Saya mengusulkan ${what} — ${outcome}]`;
  });
  return { role: "assistant", content: [message.content, ...notes].filter(Boolean).join("\n\n") || "(tanpa teks)" };
}

export function toConversation(row: typeof schema.aiConversations.$inferSelect): Conversation {
  return {
    id: row.id,
    title: row.title,
    pageId: row.pageId,
    model: row.model,
    messages: row.messages as ChatMessage[],
    summary: row.summary,
    compactedCount: row.compactedCount,
  };
}

export async function getOwnedConversation(id: string, userId: string) {
  const [row] = await db
    .select()
    .from(schema.aiConversations)
    .where(and(eq(schema.aiConversations.id, id), eq(schema.aiConversations.userId, userId)));
  return row ? toConversation(row) : null;
}

const SUMMARY_PROMPT = `Ringkas percakapan antara pengguna dan asisten penulis dokumentasi di bawah ini, agar percakapan bisa dilanjutkan tanpa membaca ulang semuanya.
Pertahankan: tujuan pengguna, keputusan yang sudah diambil, preferensi gaya/bahasa, fakta dan detail teknis penting, halaman yang dibahas, usulan yang diterapkan/diabaikan, serta pekerjaan yang belum selesai.
Tulis dalam bahasa percakapan, berupa poin-poin ringkas (maksimal ~300 kata). Balas hanya dengan ringkasannya.`;

/**
 * Auto-compaction: once the history to send grows past COMPACT_AT_CHARS
 * (or when forced), folds all but the last KEEP_RECENT messages into a summary,
 * together with any previous summary. Returns null when nothing changed.
 */
export async function compactIfNeeded(
  config: AiConfig,
  conversation: Conversation,
  { force = false }: { force?: boolean } = {},
): Promise<{ summary: string; compactedCount: number } | null> {
  const { messages, summary, compactedCount } = conversation;
  const pending = messages.slice(compactedCount).map(historyEntry);
  const size = pending.reduce((sum, m) => sum + m.content.length, 0) + (summary?.length ?? 0);
  const foldUpTo = messages.length - KEEP_RECENT;
  if (foldUpTo <= compactedCount || (!force && size < COMPACT_AT_CHARS)) return null;

  const transcript = messages
    .slice(compactedCount, foldUpTo)
    .map(historyEntry)
    .map((m) => `${m.role === "user" ? "Pengguna" : "Asisten"}: ${m.content.slice(0, 8_000)}`)
    .join("\n\n");
  const text = await completeChat(
    config,
    [
      { role: "system", content: SUMMARY_PROMPT },
      {
        role: "user",
        content: `${summary ? `Ringkasan sebelumnya:\n"""\n${summary}\n"""\n\n` : ""}Percakapan lanjutan:\n"""\n${transcript.slice(0, 120_000)}\n"""`,
      },
    ],
    1500,
    120_000,
  );
  if (!text) return null;
  return { summary: text, compactedCount: foldUpTo };
}
