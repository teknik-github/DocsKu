"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUp,
  Check,
  ChevronDown,
  Cpu,
  FilePlus2,
  History,
  ListChecks,
  Loader2,
  PencilLine,
  Plus,
  Search,
  Shrink,
  Sparkles,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { createDraftFromProposal } from "@/app/admin/_actions/pages";
import {
  compactConversation,
  deleteConversation,
  getConversation,
  listChatModels,
  listConversations,
  renameConversation,
  setConversationModel,
  updateProposal,
} from "@/app/admin/_actions/chat";
import { describeUsage, readNdjson, renderChatMarkdown } from "@/components/admin/editor/ai-client";
import { formatDateTime } from "@/components/admin/format";
import type { AgentEvent, ChatMessage, ConversationListItem, CurrentPage, Proposal, ProposalState } from "@/lib/ai/chat-types";

type Assistant = Extract<ChatMessage, { role: "assistant" }>;
type ApplyMode = "draft" | "publish" | "schedule";

const STARTERS = {
  page: [
    "Periksa SEO halaman ini dan usulkan perbaikannya",
    "Berikan 5 judul alternatif yang lebih menarik",
    "Rapikan dan perjelas isi halaman ini",
    "Tambahkan bagian FAQ di akhir halaman",
  ],
  global: [
    "Beri ide 5 topik dokumentasi yang belum ada di situs ini",
    "Buat kerangka halaman panduan instalasi",
    "Tulis halaman baru: panduan memulai untuk pemula",
    "Halaman mana yang perlu ditambah agar dokumentasi lengkap?",
  ],
};

export function AiChat({
  enabled,
  layout = "panel",
  pageId,
  getPage,
  onApplyEdit,
  onClose,
}: {
  enabled: boolean;
  /** "panel" sits beside the editor; "page" is the full AI Chat screen with a history column. */
  layout?: "panel" | "page";
  /** Limits the history to chats about this page (editor panel). */
  pageId?: string;
  /** Current page in the editor; omitted on the standalone chat page. */
  getPage?: () => CurrentPage;
  onApplyEdit?: (proposal: Proposal) => Promise<void> | void;
  onClose?: () => void;
}) {
  const mode = getPage ? "page" : "global";
  const [conversations, setConversations] = useState<ConversationListItem[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [title, setTitle] = useState("Percakapan baru");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [compactedCount, setCompactedCount] = useState(0);
  const [models, setModels] = useState<string[]>([]);
  const [defaultModel, setDefaultModel] = useState("");
  const [model, setModel] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [notice, setNotice] = useState("");
  const abort = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  async function refreshList() {
    setConversations(await listConversations(pageId ?? null));
  }

  async function open(id: string) {
    const conversation = await getConversation(id);
    if (!conversation) return;
    abort.current?.abort();
    setActiveId(conversation.id);
    setTitle(conversation.title);
    setMessages(conversation.messages);
    setSummary(conversation.summary);
    setCompactedCount(conversation.compactedCount);
    setModel(conversation.model ?? "");
    setShowHistory(false);
  }

  function startNew() {
    abort.current?.abort();
    setActiveId(null);
    setTitle("Percakapan baru");
    setMessages([]);
    setSummary(null);
    setCompactedCount(0);
    setModel("");
    setShowHistory(false);
  }

  // Load the model list and history once; in the editor, reopen this page's latest chat.
  useEffect(() => {
    if (!enabled) return;
    (async () => {
      const [{ models: found, defaultModel: fallback }, list] = await Promise.all([
        listChatModels(),
        listConversations(pageId ?? null),
      ]);
      setModels(found);
      setDefaultModel(fallback);
      setConversations(list);
      if (pageId && list[0]) await open(list[0].id);
    })();
    return () => abort.current?.abort();
    // Runs once per mounted chat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const updateReply = (fn: (m: Assistant) => Assistant) =>
    setMessages((list) => {
      const last = list.at(-1);
      return last?.role === "assistant" ? [...list.slice(0, -1), fn(last)] : list;
    });

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const now = new Date().toISOString();
    setMessages((list) => [
      ...list,
      { id: `local-user-${now}`, role: "user", content, createdAt: now },
      { id: `local-reply-${now}`, role: "assistant", content: "", tools: [], proposals: [], createdAt: now },
    ]);
    setInput("");
    setBusy(true);
    setNotice("");
    const controller = new AbortController();
    abort.current = controller;
    try {
      const res = await fetch("/admin/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId: activeId,
          message: content,
          model: model || null,
          page: getPage?.() ?? null,
        }),
        signal: controller.signal,
      });
      await readNdjson<AgentEvent>(res, (event) => {
        switch (event.t) {
          case "conversation":
            setActiveId(event.id);
            setTitle(event.title);
            // Use the server's ids so proposal updates find their message.
            setMessages((list) =>
              list.map((m, i) =>
                i === list.length - 2 ? { ...m, id: event.userMessageId } : i === list.length - 1 ? { ...m, id: event.assistantMessageId } : m,
              ),
            );
            break;
          case "compacted":
            setSummary(event.summary);
            setCompactedCount(event.count);
            setNotice("Percakapan panjang diringkas otomatis agar hemat token.");
            break;
          case "thinking":
            setThinking(true);
            break;
          case "text":
            setThinking(false);
            updateReply((m) => ({ ...m, content: m.content + event.v }));
            break;
          case "tool":
            updateReply((m) => ({ ...m, tools: [...m.tools, event.label] }));
            break;
          case "proposal":
            updateReply((m) => ({ ...m, proposals: [...m.proposals, event.proposal] }));
            break;
          case "usage":
            updateReply((m) => ({ ...m, usage: event.usage }));
            break;
          case "error":
            updateReply((m) => ({ ...m, error: event.v }));
            break;
        }
      });
    } catch (e) {
      if (!controller.signal.aborted) updateReply((m) => ({ ...m, error: (e as Error).message }));
    } finally {
      setBusy(false);
      setThinking(false);
      void refreshList();
    }
  }

  function setProposal(messageId: string, proposalId: string, patch: Partial<ProposalState>) {
    setMessages((list) =>
      list.map((m) =>
        m.role === "assistant" && m.id === messageId
          ? { ...m, proposals: m.proposals.map((p) => (p.id === proposalId ? { ...p, ...patch } : p)) }
          : m,
      ),
    );
    // Callers that apply several proposals await this: each update rewrites the stored chat.
    return activeId ? updateProposal(activeId, messageId, proposalId, patch) : Promise.resolve();
  }

  /** New pages: "draft" only creates it; "publish"/"schedule" also publish it, because the user clicked that. */
  async function apply(messageId: string, p: ProposalState, mode: ApplyMode = "draft") {
    if (p.kind === "new") {
      const result = await createDraftFromProposal({
        title: p.title ?? "Tanpa judul",
        description: p.description,
        slug: p.slug,
        content: p.contentMarkdown ?? "",
        seo: p.seo,
        section: p.section,
        publishAt: p.publishAt,
        mode,
      });
      await setProposal(
        messageId,
        p.id,
        result.ok ? { status: "applied", draftId: result.id, pageStatus: result.status, error: undefined } : { error: result.error },
      );
    } else {
      await onApplyEdit?.(p);
      await setProposal(messageId, p.id, { status: "applied" });
    }
  }

  /** "Terapkan semua": each new page with its main action (scheduled if it has a date), one after another. */
  async function applyAll(message: Assistant) {
    for (const p of message.proposals) {
      if (p.kind === "new" && !p.status) await apply(message.id, p, p.publishAt ? "schedule" : "draft");
    }
  }

  async function compactNow() {
    if (!activeId) return;
    setNotice("Meringkas percakapan…");
    const result = await compactConversation(activeId);
    if (!result.ok) return setNotice(result.error);
    setSummary(result.summary);
    setCompactedCount(result.compactedCount);
    setNotice("Percakapan diringkas. Pesan lama tidak dikirim ulang ke AI.");
  }

  async function remove(id: string) {
    if (!confirm("Hapus percakapan ini?")) return;
    await deleteConversation(id);
    if (id === activeId) startNew();
    await refreshList();
  }

  if (!enabled) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-fg-muted">
        <Sparkles className="size-6 text-accent" />
        AI belum diaktifkan atau API key belum diisi.
        <Link href="/admin/settings" className="text-accent hover:underline">
          Atur AI di Pengaturan
        </Link>
      </div>
    );
  }

  const historyList = (
    <HistoryList
      conversations={conversations}
      activeId={activeId}
      showPage={mode === "global"}
      onOpen={open}
      onNew={startNew}
      onDelete={remove}
    />
  );

  const chat = (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-1.5 border-b border-line px-4">
        {/* The full page shows history in a side column; small screens and the editor panel use a toggle. */}
        <span className={layout === "page" ? "md:hidden" : ""}>
          <IconButton label="Riwayat percakapan" onClick={() => setShowHistory(!showHistory)} active={showHistory}>
            <History className="size-4" />
          </IconButton>
        </span>
        <Sparkles className="size-4 shrink-0 text-accent" />
        <TitleEditor
          title={title}
          editable={Boolean(activeId)}
          onRename={async (next) => {
            setTitle(next);
            if (activeId) await renameConversation(activeId, next);
            void refreshList();
          }}
        />
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          {activeId && messages.length > 6 && (
            <button
              type="button"
              onClick={compactNow}
              disabled={busy}
              title="Ringkas pesan lama agar hemat token"
              className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-fg-muted hover:bg-fill hover:text-fg disabled:opacity-50"
            >
              <Shrink className="size-3.5" />
              <span className={layout === "panel" ? "sr-only" : ""}>Ringkas sekarang</span>
            </button>
          )}
          <IconButton label="Percakapan baru" onClick={startNew}>
            <Plus className="size-4" />
          </IconButton>
          {onClose && (
            <IconButton label="Tutup" onClick={onClose}>
              <X className="size-4" />
            </IconButton>
          )}
        </div>
      </div>

      {showHistory && (
        <div className={`absolute inset-x-0 top-12 bottom-0 z-10 flex flex-col bg-page ${layout === "page" ? "md:hidden" : ""}`}>
          {historyList}
        </div>
      )}

      <div className={`min-h-0 flex-1 space-y-4 overflow-y-auto ${layout === "page" ? "px-6 py-6 lg:px-10" : "p-4"}`}>
        {messages.length === 0 && (
          <div className="space-y-3 pt-4">
            <p className="text-sm text-fg-muted">
              {mode === "page"
                ? "Tanya atau minta bantuan untuk halaman ini: judul, isi, struktur, atau SEO. Setiap perubahan muncul sebagai usulan yang bisa Anda terapkan."
                : "Rencanakan dan tulis dokumentasi: ide topik, kerangka, sampai draf halaman baru siap disunting."}
            </p>
            <div className="flex flex-col gap-1.5">
              {STARTERS[mode].map((starter) => (
                <button
                  key={starter}
                  type="button"
                  onClick={() => send(starter)}
                  className="rounded-lg border border-line bg-surface px-3 py-2 text-left text-xs text-fg-muted hover:border-accent hover:text-fg"
                >
                  {starter}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message, i) => (
          <div key={message.id} className="space-y-4">
            {i === compactedCount && compactedCount > 0 && summary && <CompactedDivider count={compactedCount} summary={summary} />}
            {message.role === "user" ? (
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-fill px-3.5 py-2 text-sm whitespace-pre-wrap text-fg">{message.content}</div>
              </div>
            ) : (
              <div className="space-y-2">
                {message.tools.map((tool, j) => (
                  <p key={j} className="flex items-center gap-1.5 text-[11px] text-fg-subtle">
                    <Search className="size-3" />
                    {tool}
                  </p>
                ))}
                {message.content && (
                  <div className="chat-prose text-sm leading-relaxed text-fg" dangerouslySetInnerHTML={{ __html: renderChatMarkdown(message.content) }} />
                )}
                {message.proposals.map((proposal) => (
                  <ProposalCard
                    key={proposal.id}
                    proposal={proposal}
                    current={getPage}
                    onApply={(mode) => apply(message.id, proposal, mode)}
                    onDismiss={() => void setProposal(message.id, proposal.id, { status: "dismissed" })}
                  />
                ))}
                {!(busy && i === messages.length - 1) && <ApplyAll message={message} onApplyAll={() => applyAll(message)} />}
                {message.error && <p className="text-sm text-red-600 dark:text-red-400">{message.error}</p>}
                {message.usage && (
                  <p className="text-[10px] text-fg-subtle" title="Token yang dipakai untuk jawaban ini">
                    {message.model && `${message.model} · `}
                    {describeUsage(message.usage)}
                  </p>
                )}
                {busy && i === messages.length - 1 && (
                  <p className="flex items-center gap-1.5 text-xs text-fg-subtle">
                    <Loader2 className="size-3 animate-spin" />
                    {thinking ? "Berpikir…" : "Menulis…"}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
        <div ref={bottom} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className={`border-t border-line ${layout === "page" ? "px-6 py-4 lg:px-10" : "p-3"}`}
      >
        {notice && <p className="mb-2 text-[11px] text-fg-muted">{notice}</p>}
        <div className="rounded-xl border border-line bg-surface focus-within:border-accent">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={2}
            placeholder="Tulis pesan… (Enter untuk kirim, Shift+Enter baris baru)"
            aria-label="Pesan untuk AI"
            className="block max-h-48 min-h-12 w-full resize-none bg-transparent px-3 pt-2.5 text-sm outline-none placeholder:text-fg-subtle"
          />
          <div className="flex items-center gap-2 px-2 pb-2">
            <label className="relative flex min-w-0 items-center">
              <Cpu className="pointer-events-none absolute left-2.5 size-3.5 text-fg-subtle" />
              <select
                value={model}
                onChange={(e) => {
                  setModel(e.target.value);
                  if (activeId) void setConversationModel(activeId, e.target.value || null);
                }}
                aria-label="Model AI"
                title="Model untuk percakapan ini"
                className="h-7 max-w-full min-w-0 cursor-pointer appearance-none truncate rounded-full bg-fill pr-7 pl-7 font-mono text-[11px] text-fg-muted outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/30"
              >
                <option value="">{defaultModel ? `${defaultModel} (bawaan)` : "Model bawaan"}</option>
                {models
                  .filter((m) => m !== defaultModel)
                  .map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                {model && !models.includes(model) && <option value={model}>{model}</option>}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 size-3 text-fg-subtle" />
            </label>
            <div className="ml-auto">
              {busy ? (
                <button type="button" onClick={() => abort.current?.abort()} aria-label="Hentikan" className="inline-flex size-8 items-center justify-center rounded-lg bg-fg text-page">
                  <Square className="size-3" />
                </button>
              ) : (
                <button type="submit" disabled={!input.trim()} aria-label="Kirim" className="inline-flex size-8 items-center justify-center rounded-lg bg-accent text-white disabled:opacity-40">
                  <ArrowUp className="size-4" />
                </button>
              )}
            </div>
          </div>
        </div>
        <p className="mt-1.5 text-[10px] text-fg-subtle">AI bisa keliru. Periksa usulan sebelum diterapkan dan diterbitkan.</p>
      </form>
    </div>
  );

  if (layout === "page") {
    return (
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-64 shrink-0 flex-col border-r border-line md:flex">{historyList}</aside>
        {chat}
      </div>
    );
  }
  return chat;
}

function IconButton({ label, onClick, active, children }: { label: string; onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`inline-flex size-7 shrink-0 items-center justify-center rounded-md hover:bg-fill hover:text-fg ${active ? "bg-fill text-fg" : "text-fg-subtle"}`}
    >
      {children}
    </button>
  );
}

function TitleEditor({ title, editable, onRename }: { title: string; editable: boolean; onRename: (title: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  if (editing) {
    return (
      <form
        className="min-w-0 flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          setEditing(false);
          if (value.trim() && value !== title) onRename(value.trim());
        }}
      >
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
          aria-label="Nama percakapan"
          className="h-7 w-full rounded-md border border-line bg-surface px-2 text-sm outline-none focus:border-accent"
        />
      </form>
    );
  }
  return (
    <button
      type="button"
      disabled={!editable}
      onClick={() => {
        setValue(title);
        setEditing(true);
      }}
      title={editable ? "Ganti nama percakapan" : undefined}
      className="min-w-0 flex-1 truncate text-left text-sm font-medium enabled:hover:text-accent"
    >
      {title}
    </button>
  );
}

function HistoryList({
  conversations,
  activeId,
  showPage,
  onOpen,
  onNew,
  onDelete,
}: {
  conversations: ConversationListItem[] | null;
  activeId: string | null;
  showPage: boolean;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="p-3">
        <button
          type="button"
          onClick={onNew}
          className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-surface text-xs font-medium hover:border-accent"
        >
          <Plus className="size-3.5" />
          Percakapan baru
        </button>
      </div>
      <p className="px-4 pb-1 text-[11px] font-medium tracking-wide text-fg-subtle uppercase">Riwayat</p>
      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {conversations === null && <li className="px-2 py-2 text-xs text-fg-subtle">Memuat…</li>}
        {conversations?.length === 0 && <li className="px-2 py-2 text-xs text-fg-subtle">Belum ada percakapan.</li>}
        {conversations?.map((c) => (
          <li key={c.id} className="group/item relative">
            <button
              type="button"
              onClick={() => onOpen(c.id)}
              className={`block w-full rounded-lg px-2.5 py-2 pr-8 text-left ${c.id === activeId ? "bg-fill" : "hover:bg-fill/60"}`}
            >
              <span className="block truncate text-xs text-fg">{c.title}</span>
              <span className="block truncate text-[10px] text-fg-subtle">
                {formatDateTime(c.updatedAt)}
                {showPage && c.pageTitle && ` · ${c.pageTitle}`}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onDelete(c.id)}
              aria-label={`Hapus ${c.title}`}
              className="absolute top-2 right-1.5 inline-flex size-6 items-center justify-center rounded text-fg-subtle opacity-0 group-hover/item:opacity-100 hover:text-red-600 focus:opacity-100"
            >
              <Trash2 className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CompactedDivider({ count, summary }: { count: number; summary: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-dashed border-line px-3 py-2">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-1.5 text-[11px] text-fg-subtle hover:text-fg">
        <Shrink className="size-3" />
        {count} pesan di atas sudah diringkas otomatis dan tidak dikirim ulang ke AI
        <ChevronDown className={`ml-auto size-3 transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && <div className="chat-prose mt-2 text-xs text-fg-muted" dangerouslySetInnerHTML={{ __html: renderChatMarkdown(summary) }} />}
    </div>
  );
}

function Change({ label, before, after }: { label: string; before?: string; after: string }) {
  return (
    <div className="text-xs">
      <span className="font-medium text-fg-muted">{label}</span>
      {before !== undefined && before !== after && <p className="text-fg-subtle line-through">{before || "(kosong)"}</p>}
      <p className="text-fg">{after}</p>
    </div>
  );
}

/** Shown under a reply with several new pages (a content plan) that are still pending. */
function ApplyAll({ message, onApplyAll }: { message: Assistant; onApplyAll: () => Promise<void> }) {
  const [pending, setPending] = useState(false);
  const open = message.proposals.filter((p) => p.kind === "new" && !p.status);
  if (open.length < 2) return null;
  const scheduled = open.filter((p) => p.publishAt).length;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-accent/40 px-3 py-2 text-xs">
      <span className="text-fg-muted">
        {open.length} halaman baru{scheduled > 0 && `, ${scheduled} dengan jadwal terbit`}
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          await onApplyAll();
          setPending(false);
        }}
        className="ml-auto inline-flex h-7 items-center gap-1 rounded-md bg-accent px-2.5 font-medium text-white hover:bg-accent-strong disabled:opacity-60"
      >
        {pending ? <Loader2 className="size-3 animate-spin" /> : <ListChecks className="size-3.5" />}
        {scheduled > 0 ? "Buat semua & jadwalkan" : "Buat semua draf"}
      </button>
    </div>
  );
}

const DONE: Record<NonNullable<ProposalState["pageStatus"]>, string> = {
  draft: "Draf dibuat.",
  published: "Dibuat dan diterbitkan.",
  scheduled: "Dibuat dan dijadwalkan.",
};

function ProposalCard({
  proposal,
  current,
  onApply,
  onDismiss,
}: {
  proposal: ProposalState;
  current?: () => CurrentPage;
  onApply: (mode: ApplyMode) => Promise<void>;
  onDismiss: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<ApplyMode | null>(null);
  const page = proposal.kind === "edit" ? current?.() : undefined;
  const done = proposal.status === "applied";
  const Icon = proposal.kind === "new" ? FilePlus2 : PencilLine;
  const isNew = proposal.kind === "new";
  // A dated proposal is scheduled by default; otherwise the main action only creates a draft.
  const actions: { mode: ApplyMode; label: string }[] = !isNew
    ? [{ mode: "draft", label: "Terapkan" }]
    : proposal.publishAt
      ? [
          { mode: "schedule", label: "Buat & jadwalkan" },
          { mode: "draft", label: "Draf saja" },
        ]
      : [
          { mode: "draft", label: "Buat draf" },
          { mode: "publish", label: "Buat & terbitkan" },
        ];

  async function run(mode: ApplyMode) {
    if (mode === "publish" && !confirm("Buat halaman ini dan langsung terbitkan?")) return;
    setPending(mode);
    await onApply(mode);
    setPending(null);
  }

  return (
    <div className={`rounded-xl border p-3 ${done ? "border-emerald-300/60 bg-emerald-50/50 dark:bg-emerald-950/20" : "border-accent/40 bg-accent-soft/30"}`}>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-accent">
        <Icon className="size-3.5" />
        {isNew ? "Usulan halaman baru" : "Usulan perubahan halaman"}
      </p>
      <div className="space-y-2">
        {proposal.title && <Change label="Judul" before={page?.title} after={proposal.title} />}
        {proposal.description && <Change label="Deskripsi" before={page?.description} after={proposal.description} />}
        {isNew && proposal.slug && <Change label="URL" after={`/docs/${proposal.slug.replace(/^\/?docs\//, "")}`} />}
        {isNew && proposal.section && <Change label="Navigasi" after={proposal.section} />}
        {isNew && proposal.publishAt && <Change label="Jadwal terbit" after={formatDateTime(proposal.publishAt)} />}
        {proposal.seo?.title && <Change label="Meta title" before={page?.seo.title} after={proposal.seo.title} />}
        {proposal.seo?.description && <Change label="Meta description" before={page?.seo.description} after={proposal.seo.description} />}
        {proposal.note && <p className="text-xs text-fg-muted italic">{proposal.note}</p>}
        {proposal.contentMarkdown && (
          <div>
            <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-1 text-xs font-medium text-fg-muted hover:text-fg">
              <ChevronDown className={`size-3 transition-transform ${open ? "" : "-rotate-90"}`} />
              {isNew ? "Isi halaman" : proposal.contentMode === "append" ? "Isi yang ditambahkan di akhir" : "Isi baru (mengganti seluruh isi)"}
              <span className="font-normal text-fg-subtle">· {proposal.contentMarkdown.length} karakter</span>
            </button>
            {open && (
              <pre className="mt-1 max-h-64 overflow-auto rounded-lg border border-line bg-page p-2 font-mono text-[11px] whitespace-pre-wrap text-fg-muted">
                {proposal.contentMarkdown}
              </pre>
            )}
          </div>
        )}
      </div>

      {proposal.error && <p className="mt-2 text-xs text-red-600">{proposal.error}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {done ? (
          <span className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
            <Check className="size-3.5" />
            {isNew ? DONE[proposal.pageStatus ?? "draft"] : "Diterapkan. Batalkan dengan Ctrl+Z atau dari Riwayat revisi."}
            {proposal.draftId && (
              <Link href={`/admin/pages/${proposal.draftId}`} className="ml-1 font-medium underline">
                Buka halaman
              </Link>
            )}
          </span>
        ) : proposal.status === "dismissed" ? (
          <span className="text-xs text-fg-subtle">Diabaikan.</span>
        ) : (
          <>
            {actions.map((action, i) => (
              <button
                key={action.mode}
                type="button"
                disabled={pending !== null || (!isNew && !current)}
                onClick={() => run(action.mode)}
                className={
                  i === 0
                    ? "inline-flex h-7 items-center gap-1 rounded-md bg-accent px-2.5 text-xs font-medium text-white hover:bg-accent-strong disabled:opacity-60"
                    : "inline-flex h-7 items-center gap-1 rounded-md border border-line bg-surface px-2.5 text-xs text-fg hover:bg-fill disabled:opacity-60"
                }
              >
                {pending === action.mode && <Loader2 className="size-3 animate-spin" />}
                {action.label}
              </button>
            ))}
            <button type="button" onClick={onDismiss} className="h-7 rounded-md px-2.5 text-xs text-fg-muted hover:bg-fill">
              Abaikan
            </button>
          </>
        )}
      </div>
    </div>
  );
}
