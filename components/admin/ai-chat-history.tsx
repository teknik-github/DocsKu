"use client";

import { useState } from "react";
import { FileText, MessageSquareText, MoreHorizontal, PanelLeftClose, Pencil, Pin, PinOff, Plus, Search, Send, Trash2 } from "lucide-react";
import type { ConversationListItem } from "@/lib/ai/chat-types";

/**
 * AI Chat history: search, a filter for chats about a page or general ones,
 * pinned chats first, then the rest grouped by day (Asia/Jakarta). Each row has
 * pin, rename and delete on hover/focus or from its "⋯" menu on touch screens.
 */

type Filter = "all" | "page" | "general";

const DAY = 86_400_000;
const dayKey = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(date);

function groupOf(iso: string, now: Date): string {
  const date = new Date(iso);
  const today = dayKey(now);
  if (dayKey(date) === today) return "Hari ini";
  if (dayKey(date) === dayKey(new Date(now.getTime() - DAY))) return "Kemarin";
  const age = now.getTime() - date.getTime();
  if (age < 7 * DAY) return "7 hari terakhir";
  if (age < 30 * DAY) return "30 hari terakhir";
  return "Lebih lama";
}

const GROUPS = ["Hari ini", "Kemarin", "7 hari terakhir", "30 hari terakhir", "Lebih lama"];

/** "baru saja", "5 mnt", "3 jam", "2 hr", or a date. */
function ago(iso: string, now: Date) {
  const minutes = Math.round((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "baru saja";
  if (minutes < 60) return `${minutes} mnt`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} jam`;
  if (minutes < 7 * 24 * 60) return `${Math.round(minutes / 1440)} hr`;
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" }).format(new Date(iso));
}

export function ChatHistory({
  conversations,
  activeId,
  showPage,
  onOpen,
  onNew,
  onDelete,
  onPin,
  onRename,
  onCollapse,
}: {
  conversations: ConversationListItem[] | null;
  activeId: string | null;
  /** The full AI Chat page lists chats of every page; the editor panel only this page's. */
  showPage: boolean;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onRename: (id: string, title: string) => void;
  /** Hides the column (full page, wide screens). */
  onCollapse?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  // Fixed for this render: grouping and "5 mnt" are recomputed whenever the list changes.
  const [now] = useState(() => new Date());

  const q = query.trim().toLocaleLowerCase("id");
  const shown = (conversations ?? []).filter(
    (c) =>
      (!q || c.title.toLocaleLowerCase("id").includes(q) || (c.pageTitle ?? "").toLocaleLowerCase("id").includes(q)) &&
      (filter === "all" || (filter === "page" ? Boolean(c.pageId) : !c.pageId)),
  );
  const pinned = shown.filter((c) => c.pinned);
  const groups = GROUPS.map((title) => ({ title, items: shown.filter((c) => !c.pinned && groupOf(c.updatedAt, now) === title) })).filter((g) => g.items.length);

  const row = (c: ConversationListItem) => {
    const active = c.id === activeId;
    if (renaming === c.id) {
      return (
        <li key={c.id} className="px-1 py-1">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const value = new FormData(e.currentTarget).get("title");
              if (typeof value === "string" && value.trim() && value.trim() !== c.title) onRename(c.id, value.trim());
              setRenaming(null);
            }}
          >
            <input
              name="title"
              autoFocus
              defaultValue={c.title}
              maxLength={120}
              aria-label="Nama percakapan"
              onBlur={(e) => e.currentTarget.form?.requestSubmit()}
              onKeyDown={(e) => e.key === "Escape" && setRenaming(null)}
              className="h-8 w-full rounded-lg border border-accent bg-surface px-2.5 text-sm outline-none"
            />
          </form>
        </li>
      );
    }
    return (
      <li key={c.id} className="group/item relative" data-testid="chat-history-item">
        <button
          type="button"
          onClick={() => onOpen(c.id)}
          aria-current={active ? "true" : undefined}
          className={`relative block w-full rounded-lg py-2 pr-9 pl-3 text-left transition-colors ${active ? "bg-fill" : "hover:bg-fill/60"}`}
        >
          {active && <span aria-hidden className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-accent" />}
          <span className={`block truncate text-[13px] ${active ? "font-medium text-fg" : "text-fg"}`}>{c.title}</span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-fg-subtle">
            {showPage && c.pageTitle ? (
              <span className="inline-flex min-w-0 items-center gap-1 truncate">
                <FileText className="size-3 shrink-0" />
                <span className="truncate">{c.pageTitle}</span>
              </span>
            ) : showPage ? (
              <span className="shrink-0">Umum</span>
            ) : null}
            {showPage && <span aria-hidden>·</span>}
            {c.source === "telegram" && (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-sky-100 px-1 text-[10px] font-medium text-sky-700 dark:bg-sky-950/50 dark:text-sky-300" title="Percakapan dari Telegram">
                <Send className="size-2.5" />
                Telegram
              </span>
            )}
            <span className="shrink-0">{ago(c.updatedAt, now)}</span>
            {c.messageCount > 0 && <span className="ml-auto shrink-0 tabular-nums">{Math.ceil(c.messageCount / 2)}</span>}
          </span>
        </button>
        <div
          className={`absolute top-1.5 right-1 flex items-center gap-0.5 rounded-md bg-fill/95 p-0.5 ${menu === c.id ? "" : "opacity-0 group-hover/item:opacity-100 focus-within:opacity-100"} max-sm:opacity-100`}
        >
          <button
            type="button"
            onClick={() => setMenu(menu === c.id ? null : c.id)}
            aria-label={`Tindakan untuk ${c.title}`}
            aria-expanded={menu === c.id}
            className="inline-flex size-6 items-center justify-center rounded text-fg-subtle hover:text-fg"
          >
            <MoreHorizontal className="size-3.5" />
          </button>
          {menu === c.id && (
            <>
              <button
                type="button"
                onClick={() => {
                  onPin(c.id, !c.pinned);
                  setMenu(null);
                }}
                aria-label={c.pinned ? `Lepas sematan ${c.title}` : `Sematkan ${c.title}`}
                title={c.pinned ? "Lepas sematan" : "Sematkan"}
                className="inline-flex size-6 items-center justify-center rounded text-fg-subtle hover:text-fg"
              >
                {c.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  setRenaming(c.id);
                  setMenu(null);
                }}
                aria-label={`Ganti nama ${c.title}`}
                title="Ganti nama"
                className="inline-flex size-6 items-center justify-center rounded text-fg-subtle hover:text-fg"
              >
                <Pencil className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenu(null);
                  onDelete(c.id);
                }}
                aria-label={`Hapus ${c.title}`}
                title="Hapus"
                className="inline-flex size-6 items-center justify-center rounded text-fg-subtle hover:text-red-600"
              >
                <Trash2 className="size-3.5" />
              </button>
            </>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="chat-history">
      <div className="flex items-center gap-1.5 p-3 pb-2">
        <button
          type="button"
          onClick={onNew}
          className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent text-sm font-medium text-white transition-colors hover:bg-accent-strong"
        >
          <Plus className="size-4" />
          Percakapan baru
        </button>
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            aria-label="Sembunyikan riwayat"
            title="Sembunyikan riwayat"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-fg-subtle hover:bg-fill hover:text-fg"
          >
            <PanelLeftClose className="size-4" />
          </button>
        )}
      </div>
      <div className="space-y-2 px-3 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-fg-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari percakapan…"
            aria-label="Cari percakapan"
            className="h-8 w-full rounded-lg border border-line bg-surface pr-2 pl-8 text-xs outline-none focus:border-accent"
          />
        </div>
        {showPage && (
          <div className="flex gap-0.5 rounded-lg bg-fill p-0.5 text-[11px]" role="group" aria-label="Saring percakapan">
            {(
              [
                ["all", "Semua"],
                ["page", "Halaman"],
                ["general", "Umum"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={filter === id}
                onClick={() => setFilter(id)}
                className={`flex-1 rounded-md py-1 transition-colors ${filter === id ? "bg-surface font-medium text-fg shadow-sm" : "text-fg-muted hover:text-fg"}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {conversations === null ? (
          <div className="space-y-2 px-1 pt-2" aria-label="Memuat">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-11 animate-pulse rounded-lg bg-fill/70" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <div className="flex flex-col items-center px-4 pt-10 text-center">
            <MessageSquareText className="size-6 text-fg-subtle" />
            <p className="mt-2 text-xs text-fg-muted">{q || filter !== "all" ? "Tidak ada percakapan yang cocok." : "Belum ada percakapan."}</p>
          </div>
        ) : (
          <>
            {pinned.length > 0 && (
              <section className="mb-2">
                <h3 className="flex items-center gap-1 px-3 pt-2 pb-1 text-[10px] font-semibold tracking-wide text-fg-subtle uppercase">
                  <Pin className="size-3" />
                  Disematkan
                </h3>
                <ul className="space-y-0.5">{pinned.map(row)}</ul>
              </section>
            )}
            {groups.map((group) => (
              <section key={group.title} className="mb-2">
                <h3 className="px-3 pt-2 pb-1 text-[10px] font-semibold tracking-wide text-fg-subtle uppercase">{group.title}</h3>
                <ul className="space-y-0.5">{group.items.map(row)}</ul>
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
