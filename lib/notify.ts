import "server-only";

/**
 * One entry point for "something happened" notifications: email (outbox) and
 * webhooks (Slack, Discord, Telegram, custom). Callers fire and forget after a
 * change has succeeded; `notify` never throws and never blocks on delivery
 * (it only queues rows; the scheduler tick delivers them with retries).
 *
 * `actorId` (optional on every event) is the signed-in person who caused it:
 * they are never emailed about their own action.
 *
 * This file is the stable interface. Delivery lives in lib/notifications/.
 */
type Actor = { actorId?: string | null };

export type NotifyEvent = Actor &
  (
    | { type: "page.published"; pageId: string; title: string; href: string; by: string }
    | { type: "page.submitted"; pageId: string; title: string; by: string; note?: string | null }
    | { type: "page.approved"; pageId: string; title: string; href: string; by: string; authorId: string | null }
    | { type: "page.changes_requested"; pageId: string; title: string; by: string; note: string; authorId: string | null }
    | { type: "comment.new"; commentId: string; pageTitle: string; href: string; author: string; excerpt: string; pending: boolean }
    | { type: "feedback.new"; pageTitle: string; href: string; helpful: boolean; message: string; pageId?: string }
    | { type: "search.misses"; day: string; queries: { query: string; misses: number }[] }
    /** An internal note in the editor, or a reply to one. `participants`: people already in that conversation. */
    | { type: "note.new"; noteId: string; pageId: string; pageTitle: string; by: string; excerpt: string; quote: string; reply: boolean; participants: string[] }
  );

export type NotifyEventType = NotifyEvent["type"];

export async function notify(event: NotifyEvent): Promise<void> {
  try {
    const { dispatch } = await import("@/lib/notifications/dispatch");
    await dispatch(event);
  } catch (error) {
    console.error("[notify] gagal mengantrekan", event.type, error);
  }
}
