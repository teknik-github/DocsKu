"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  AtSign,
  Check,
  ClipboardCheck,
  FileText,
  PanelLeftOpen,
  ChevronDown,
  Copy,
  Cpu,
  FilePlus2,
  History,
  ListChecks,
  Loader2,
  PencilLine,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Shrink,
  Sparkles,
  Square,
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
  setConversationPinned,
  searchPagesForMention,
  applyProposalToPage,
  convertProposalMarkdown,
  truncateConversation,
  updateProposal,
} from "@/app/admin/_actions/chat";
import { copyText } from "@/lib/copy-text";
import { describeUsage, readNdjson, renderChatMarkdown } from "@/components/admin/editor/ai-client";
import { formatDateTime } from "@/components/admin/format";
import type { AgentEvent, ChatAttachment, ChatMessage, ConversationListItem, CurrentPage, Proposal, ProposalState } from "@/lib/ai/chat-types";
import { confirmDialog } from "@/components/admin/dialog";
import { ChatHistory } from "@/components/admin/ai-chat-history";
import { ProposalDiff } from "@/components/admin/proposal-diff";

/** At most this many pages attached to one message with "@". */
const MAX_ATTACHMENTS = 5;
/** "@query" right before the cursor. */
const MENTION = /(^|\s)@([^\s@]{0,40})$/;

type Assistant = Extract<ChatMessage, { role: "assistant" }>;
type ApplyMode = "draft" | "publish" | "schedule";
/** A proposal the agent is still writing (live from the stream, never stored). */
type Draft = { key: string; kind: Proposal["kind"]; title?: string; description?: string; content: string };

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
    "Bagaimana cara instalasi menurut dokumentasi ini?",
  ],
};

/** Audits: the agent looks up problem pages (audit_pages) and proposes fixes. */
const AUDITS = [
  { label: "Halaman yang perlu ditinjau", prompt: "Audit halaman yang sudah lewat jadwal tinjauan. Sebutkan masalah tiap halaman dan usulkan perbaikan untuk yang paling penting." },
  { label: "Tautan rusak", prompt: "Audit tautan rusak di dokumentasi. Untuk tiap halaman, jelaskan tautan mana yang rusak dan usulkan perbaikannya." },
  { label: "Kualitas tulisan rendah", prompt: "Audit halaman dengan skor kualitas tulisan rendah dan usulkan perbaikan untuk yang paling penting." },
  { label: "Langkah yang mungkin usang", prompt: "Cari halaman yang paling lama tidak diubah dan periksa apakah langkah, versi, atau perintahnya mungkin sudah usang. Usulkan perbaikan untuk yang paling penting." },
];

export function AiChat({
  enabled,
  layout = "panel",
  pageId,
  getPage,
  onApplyEdit,
  onClose,
  initialInput,
  initialConversationId,
}: {
  enabled: boolean;
  /** A chat to open first (`/admin/ai?c=<id>`, e.g. from a Telegram button). */
  initialConversationId?: string;
  /** Text to start the message box with (e.g. "Tulis" from Statistik); never sent on its own. */
  initialInput?: string;
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
  /** Full page, wide screens: the history column can be hidden. */
  const [historyHidden, setHistoryHidden] = useState(false);
  /** Pages attached to the next message with "@". */
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [mention, setMention] = useState<{ query: string; results: { id: string; title: string; slug: string; status: string }[]; active: number } | null>(null);
  const [input, setInput] = useState(initialInput ?? "");
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [notice, setNotice] = useState("");
  const abort = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  /** Follow new text only while the reader is at the bottom; scrolling up stops it. */
  const stick = useRef(true);
  const [atBottom, setAtBottom] = useState(true);

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
    // Separately: the model list asks the AI provider and can be slow; history must not wait for it.
    void listChatModels().then(({ models: found, defaultModel: fallback }) => {
      setModels(found);
      setDefaultModel(fallback);
    });
    void listConversations(pageId ?? null).then(async (list) => {
      setConversations(list);
      if (initialConversationId) await open(initialConversationId);
      else if (pageId && list[0]) await open(list[0].id);
    });
    return () => abort.current?.abort();
    // Runs once per mounted chat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (stick.current) bottom.current?.scrollIntoView({ block: "end" });
  }, [messages, drafts]);

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stick.current = near;
    setAtBottom(near);
  }

  function toBottom() {
    stick.current = true;
    setAtBottom(true);
    bottom.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }

  // The message box grows with its text, up to a limit.
  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  const updateReply = (fn: (m: Assistant) => Assistant) =>
    setMessages((list) => {
      const last = list.at(-1);
      return last?.role === "assistant" ? [...list.slice(0, -1), fn(last)] : list;
    });

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const now = new Date().toISOString();
    const attached = attachments;
    setAttachments([]);
    setMention(null);
    setMessages((list) => [
      ...list,
      { id: `local-user-${now}`, role: "user", content, ...(attached.length ? { attachments: attached } : {}), createdAt: now },
      { id: `local-reply-${now}`, role: "assistant", content: "", tools: [], proposals: [], createdAt: now },
    ]);
    setInput("");
    setBusy(true);
    setNotice("");
    stick.current = true;
    setAtBottom(true);
    const controller = new AbortController();
    abort.current = controller;
    try {
      const res = await fetch("/admin/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId: activeId,
          message: content,
          attachments: attached.map((a) => a.id),
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
          case "draft":
            setThinking(false);
            setDrafts((list) => {
              const found = list.find((d) => d.key === event.key);
              const base = found ?? { key: event.key, kind: event.kind, content: "" };
              const next = {
                ...base,
                title: event.title ?? base.title,
                description: event.description ?? base.description,
                content: base.content + (event.content ?? ""),
              };
              return found ? list.map((d) => (d === found ? next : d)) : [...list, next];
            });
            break;
          case "draft_end":
            setDrafts((list) => list.filter((d) => d.key !== event.key));
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
      if (controller.signal.aborted) updateReply((m) => ({ ...m, stopped: true }));
      else updateReply((m) => ({ ...m, error: (e as Error).message }));
    } finally {
      // A draft whose tool call never finished (stream cut, stopped) must not linger.
      setDrafts([]);
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

  /**
   * New pages: "draft" only creates it; "publish"/"schedule" also publish it, because the user clicked that.
   * Edits: `contentMarkdown` is set when only some sections were kept in the diff.
   */
  async function apply(messageId: string, p: ProposalState, mode: ApplyMode = "draft", contentMarkdown?: string) {
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
    } else if (p.target) {
      // Another page than the one open: applied on the server to its working copy (never published).
      if (!activeId) return;
      const result = await applyProposalToPage(activeId, messageId, p.id, contentMarkdown !== undefined ? { contentMarkdown } : undefined);
      setMessages((list) =>
        list.map((m) =>
          m.role === "assistant" && m.id === messageId
            ? { ...m, proposals: m.proposals.map((x) => (x.id === p.id ? { ...x, ...(result.ok ? { status: "applied" as const, error: undefined } : { error: result.error }) } : x)) }
            : m,
        ),
      );
      return;
    } else {
      let proposal: Proposal = p;
      if (contentMarkdown !== undefined) {
        const doc = await convertProposalMarkdown(contentMarkdown);
        if (!doc) return;
        proposal = { ...p, contentMarkdown, contentDoc: doc };
      }
      try {
        await onApplyEdit?.(proposal);
      } catch {
        // The editor refused (e.g. a conflicting save by someone else) and says why; the proposal stays applicable.
        return;
      }
      await setProposal(messageId, p.id, { status: "applied" });
    }
  }

  /** "Terapkan semua": each new page with its main action (scheduled if it has a date), one after another. */
  async function applyAll(message: Assistant) {
    for (const p of message.proposals) {
      if (p.kind === "new" && !p.status) await apply(message.id, p, p.publishAt ? "schedule" : "draft");
    }
  }

  /**
   * "Coba lagi" (send the same message again) and "Edit" (put it back in the box):
   * both drop that message and everything after it, here and in the stored chat.
   */
  async function rewind(message: ChatMessage, then: "retry" | "edit") {
    if (busy || message.role !== "user") return;
    const index = messages.findIndex((m) => m.id === message.id);
    if (index < 0) return;
    if (activeId) {
      const result = await truncateConversation(activeId, message.id);
      if (!result.ok) return setNotice(result.error);
    }
    setMessages((list) => list.slice(0, index));
    if (then === "retry") void send(message.content);
    else {
      setInput(message.content);
      requestAnimationFrame(() => textarea.current?.focus());
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

  async function pin(id: string, pinned: boolean) {
    setConversations((list) => list?.map((c) => (c.id === id ? { ...c, pinned } : c)) ?? list);
    await setConversationPinned(id, pinned);
    await refreshList();
  }

  async function renameItem(id: string, next: string) {
    if (id === activeId) setTitle(next);
    await renameConversation(id, next);
    await refreshList();
  }

  /** "@" picker: searches as the person types after "@". */
  function updateMention(value: string, caret: number) {
    const match = MENTION.exec(value.slice(0, caret));
    if (!match) return setMention(null);
    const query = match[2];
    setMention((current) => ({ query, results: current?.results ?? [], active: 0 }));
    void searchPagesForMention(query).then((results) =>
      setMention((current) => (current && current.query === query ? { ...current, results: results.filter((r) => !attachments.some((a) => a.id === r.id)) } : current)),
    );
  }

  function attach(page: { id: string; title: string; slug: string }) {
    const el = textarea.current;
    const caret = el?.selectionStart ?? input.length;
    const before = input.slice(0, caret).replace(MENTION, (_, space: string) => space);
    setInput(before + input.slice(caret));
    setAttachments((list) => (list.some((a) => a.id === page.id) || list.length >= MAX_ATTACHMENTS ? list : [...list, { id: page.id, title: page.title, slug: page.slug }]));
    setMention(null);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(before.length, before.length);
    });
  }

  async function remove(id: string) {
    const ok = await confirmDialog({ title: "Hapus percakapan ini?", message: "Seluruh pesan dalam percakapan ini dihapus permanen.", confirmLabel: "Hapus", tone: "danger" });
    if (!ok) return;
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
    <ChatHistory
      conversations={conversations}
      activeId={activeId}
      showPage={mode === "global"}
      onOpen={open}
      onNew={startNew}
      onDelete={remove}
      onPin={(id, pinned) => void pin(id, pinned)}
      onRename={(id, next) => void renameItem(id, next)}
      onCollapse={layout === "page" ? () => setHistoryHidden(true) : undefined}
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
        {layout === "page" && historyHidden && (
          <span className="hidden md:inline-flex">
            <IconButton label="Tampilkan riwayat" onClick={() => setHistoryHidden(false)}>
              <PanelLeftOpen className="size-4" />
            </IconButton>
          </span>
        )}
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

      <div ref={scroller} onScroll={onScroll} className={`min-h-0 flex-1 overflow-y-auto ${layout === "page" ? "px-6 py-6 lg:px-10" : "p-4"}`}>
        <div className={`space-y-4 ${layout === "page" ? "mx-auto max-w-3xl" : ""}`}>
        {messages.length === 0 && (
          <div className={layout === "page" ? "flex flex-col items-center pt-[8vh] text-center" : "space-y-3 pt-4"}>
            {layout === "page" && (
              <>
                <span className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                  <Sparkles className="size-6" />
                </span>
                <h2 className="font-serif text-2xl font-light tracking-tight text-fg">Apa yang ingin Anda tulis hari ini?</h2>
              </>
            )}
            <p className={`text-sm text-fg-muted ${layout === "page" ? "mt-2 max-w-md" : ""}`}>
              {mode === "page"
                ? "Tanya atau minta bantuan untuk halaman ini: judul, isi, struktur, atau SEO. Setiap perubahan muncul sebagai usulan yang bisa Anda terapkan."
                : "Rencanakan dan tulis dokumentasi: ide topik, kerangka, sampai draf halaman baru. AI membaca isi situs Anda dan tidak pernah menerbitkan sendiri."}
            </p>
            <div className={layout === "page" ? "mt-6 grid w-full gap-2 sm:grid-cols-2" : "flex flex-col gap-1.5"}>
              {STARTERS[mode].map((starter) => (
                <button
                  key={starter}
                  type="button"
                  onClick={() => send(starter)}
                  className="rounded-xl border border-line bg-surface px-3.5 py-2.5 text-left text-xs text-fg-muted transition-colors hover:border-accent hover:text-fg"
                >
                  {starter}
                </button>
              ))}
            </div>
            {mode === "global" && (
              <div className={layout === "page" ? "mt-6 w-full text-left" : "mt-3"} data-testid="audit-starters">
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-fg-subtle uppercase">
                  <ClipboardCheck className="size-3.5" />
                  Audit dokumentasi
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {AUDITS.map((audit) => (
                    <button
                      key={audit.label}
                      type="button"
                      onClick={() => send(audit.prompt)}
                      className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-fg-muted transition-colors hover:border-accent hover:text-fg"
                    >
                      {audit.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {messages.map((message, i) => (
          <div key={message.id} className="space-y-4">
            {i === compactedCount && compactedCount > 0 && summary && <CompactedDivider count={compactedCount} summary={summary} />}
            {message.role === "user" ? (
              <div className="group/user flex flex-col items-end gap-1">
                {message.attachments && message.attachments.length > 0 && (
                  <div className="flex max-w-[85%] flex-wrap justify-end gap-1">
                    {message.attachments.map((a) => (
                      <span key={a.id} className="inline-flex max-w-56 items-center gap-1 rounded-md border border-line bg-surface px-1.5 py-0.5 text-[11px] text-fg-muted">
                        <FileText className="size-3 shrink-0" />
                        <span className="truncate">{a.title}</span>
                      </span>
                    ))}
                  </div>
                )}
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-fill px-3.5 py-2 text-sm whitespace-pre-wrap text-fg">{message.content}</div>
                {!busy && i >= compactedCount && i === messages.findLastIndex((m) => m.role === "user") && (
                  <div className="flex gap-0.5 opacity-0 transition-opacity group-hover/user:opacity-100 focus-within:opacity-100">
                    <MessageAction label="Edit pesan" onClick={() => rewind(message, "edit")}>
                      <Pencil className="size-3" />
                    </MessageAction>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-[11px] font-medium text-fg-subtle">
                  <span className="flex size-5 items-center justify-center rounded-full bg-accent-soft text-accent">
                    <Sparkles className="size-3" />
                  </span>
                  AI{message.model ? <span className="font-normal">· {message.model}</span> : null}
                </p>
                {message.tools.length > 0 && <ToolSteps tools={message.tools} live={busy && i === messages.length - 1} />}
                {message.content && (
                  <div className="chat-prose text-sm leading-relaxed text-fg" dangerouslySetInnerHTML={{ __html: renderChatMarkdown(message.content) }} />
                )}
                {message.proposals.map((proposal) => (
                  <ProposalCard
                    key={proposal.id}
                    proposal={proposal}
                    current={getPage}
                    onApply={(mode, markdown) => apply(message.id, proposal, mode, markdown)}
                    onDismiss={() => void setProposal(message.id, proposal.id, { status: "dismissed" })}
                  />
                ))}
                {busy && i === messages.length - 1 && drafts.map((draft) => <DraftCard key={draft.key} draft={draft} />)}
                {!(busy && i === messages.length - 1) && <ApplyAll message={message} onApplyAll={() => applyAll(message)} />}
                {message.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">{message.error}</p>}
                {message.stopped && <p className="text-xs text-fg-subtle italic">Dihentikan.</p>}
                {!(busy && i === messages.length - 1) && (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {message.content && <CopyAction text={message.content} />}
                    {i === messages.length - 1 && messages[i - 1]?.role === "user" && i - 1 >= compactedCount && (
                      <MessageAction label="Coba lagi" onClick={() => rewind(messages[i - 1], "retry")}>
                        <RotateCcw className="size-3" />
                        <span>Coba lagi</span>
                      </MessageAction>
                    )}
                    {message.usage && (
                      <span className="text-[10px] text-fg-subtle" title="Token yang dipakai untuk jawaban ini">
                        {message.model && `${message.model} · `}
                        {describeUsage(message.usage)}
                      </span>
                    )}
                  </div>
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
      </div>

      {!atBottom && (
        <button
          type="button"
          onClick={toBottom}
          className="absolute bottom-32 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1 rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-fg-muted shadow-md hover:text-fg"
        >
          <ArrowDown className="size-3.5" />
          {busy ? "Ikuti jawaban" : "Ke pesan terbaru"}
        </button>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className={`border-t border-line ${layout === "page" ? "px-6 py-4 lg:px-10" : "p-3"}`}
      >
        <div className={layout === "page" ? "mx-auto max-w-3xl" : ""}>
        {notice && <p className="mb-2 text-[11px] text-fg-muted">{notice}</p>}
        <div className="relative rounded-xl border border-line bg-surface focus-within:border-accent">
          {mention && (
            <div className="absolute right-0 bottom-full left-0 z-20 mb-2 overflow-hidden rounded-xl border border-line bg-surface shadow-lg" data-testid="mention-picker">
              <p className="border-b border-line px-3 py-1.5 text-[11px] text-fg-subtle">
                Lampirkan halaman{mention.query ? ` · “${mention.query}”` : ""} {attachments.length >= MAX_ATTACHMENTS && `(maks. ${MAX_ATTACHMENTS})`}
              </p>
              {mention.results.length === 0 ? (
                <p className="px-3 py-3 text-xs text-fg-subtle">Tidak ada halaman yang cocok.</p>
              ) : (
                <ul role="listbox" className="max-h-56 overflow-y-auto py-1">
                  {mention.results.map((result, i) => (
                    <li key={result.id} role="option" aria-selected={i === mention.active}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => attach(result)}
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${i === mention.active ? "bg-fill" : "hover:bg-fill/60"}`}
                      >
                        <FileText className="size-3.5 shrink-0 text-fg-subtle" />
                        <span className="min-w-0 flex-1 truncate text-fg">{result.title}</span>
                        <span className="shrink-0 font-mono text-[10px] text-fg-subtle">{result.status === "published" ? `/docs/${result.slug}` : "draf"}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1 px-2 pt-2" data-testid="chat-attachments">
              {attachments.map((a) => (
                <span key={a.id} className="inline-flex max-w-60 items-center gap-1 rounded-md bg-accent-soft px-1.5 py-0.5 text-[11px] text-accent">
                  <FileText className="size-3 shrink-0" />
                  <span className="truncate">{a.title}</span>
                  <button type="button" onClick={() => setAttachments((list) => list.filter((x) => x.id !== a.id))} aria-label={`Lepas lampiran ${a.title}`} className="rounded hover:bg-accent/15">
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <textarea
            ref={textarea}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              updateMention(e.target.value, e.target.selectionStart ?? e.target.value.length);
            }}
            onKeyDown={(e) => {
              if (mention && mention.results.length) {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  const step = e.key === "ArrowDown" ? 1 : -1;
                  setMention({ ...mention, active: (mention.active + step + mention.results.length) % mention.results.length });
                  return;
                }
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  attach(mention.results[mention.active]);
                  return;
                }
              }
              if (mention && e.key === "Escape") {
                e.preventDefault();
                setMention(null);
                return;
              }
              // Not while an input method is composing a word (e.g. Japanese or Chinese IME).
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send(input);
              }
              if (e.key === "Escape" && busy) abort.current?.abort();
            }}
            rows={2}
            placeholder="Tulis pesan… ketik @ untuk melampirkan halaman (Enter kirim, Shift+Enter baris baru)"
            aria-label="Pesan untuk AI"
            className="block min-h-12 w-full resize-none bg-transparent px-3 pt-2.5 text-sm outline-none placeholder:text-fg-subtle"
          />
          <div className="flex items-center gap-2 px-2 pb-2">
            <button
              type="button"
              onClick={() => {
                const el = textarea.current;
                const caret = el?.selectionStart ?? input.length;
                const needsSpace = caret > 0 && !/\s$/.test(input.slice(0, caret));
                const next = `${input.slice(0, caret)}${needsSpace ? " " : ""}@${input.slice(caret)}`;
                setInput(next);
                const at = caret + (needsSpace ? 2 : 1);
                updateMention(next, at);
                requestAnimationFrame(() => {
                  el?.focus();
                  el?.setSelectionRange(at, at);
                });
              }}
              disabled={attachments.length >= MAX_ATTACHMENTS}
              aria-label="Lampirkan halaman"
              title="Lampirkan halaman (@)"
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-fill text-fg-muted hover:text-fg disabled:opacity-40"
            >
              <AtSign className="size-3.5" />
            </button>
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
                <button type="button" onClick={() => abort.current?.abort()} aria-label="Hentikan (Esc)" title="Hentikan (Esc)" className="inline-flex size-8 items-center justify-center rounded-lg bg-fg text-page">
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
        </div>
      </form>
    </div>
  );

  if (layout === "page") {
    return (
      <div className="flex min-h-0 flex-1">
        {!historyHidden && <aside className="hidden w-72 shrink-0 flex-col border-r border-line bg-page/40 md:flex">{historyList}</aside>}
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
  const cancelled = useRef(false);
  if (editing) {
    return (
      <form
        className="min-w-0 flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          // Saving happens on blur, so Enter and clicking away behave the same.
          e.currentTarget.querySelector("input")?.blur();
        }}
      >
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => {
            setEditing(false);
            if (!cancelled.current && value.trim() && value.trim() !== title) onRename(value.trim());
          }}
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            cancelled.current = true;
            e.currentTarget.blur();
          }}
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
        cancelled.current = false;
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

/** What the agent looked up: the latest step while it works, a collapsible list afterwards. */
function ToolSteps({ tools, live }: { tools: string[]; live: boolean }) {
  const [open, setOpen] = useState(false);
  if (live) {
    return (
      <p className="flex items-center gap-1.5 text-[11px] text-fg-subtle">
        <Search className="size-3" />
        {tools.at(-1)}
        {tools.length > 1 && <span className="opacity-70">· langkah {tools.length}</span>}
      </p>
    );
  }
  return (
    <div className="text-[11px] text-fg-subtle">
      <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-1.5 hover:text-fg">
        <Search className="size-3" />
        {tools.length === 1 ? tools[0] : `${tools.length} langkah pencarian`}
        {tools.length > 1 && <ChevronDown className={`size-3 transition-transform ${open ? "" : "-rotate-90"}`} />}
      </button>
      {open && tools.length > 1 && (
        <ol className="mt-1 ml-[18px] list-decimal space-y-0.5 pl-3">
          {tools.map((tool, i) => (
            <li key={i}>{tool}</li>
          ))}
        </ol>
      )}
    </div>
  );
}

function MessageAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] text-fg-subtle hover:bg-fill hover:text-fg"
    >
      {children}
    </button>
  );
}

function CopyAction({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <MessageAction
      label="Salin jawaban"
      onClick={async () => {
        if (!(await copyText(text))) return;
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      <span>{copied ? "Disalin" : "Salin"}</span>
    </MessageAction>
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

const COMPONENT_TAG = /<\/?(Note|Info|Tip|Check|Warning|Danger|CardGroup|Card|Steps|Step|Tabs|Tab|CodeGroup|Accordion)\b([^>]*)>/g;

/**
 * The chat renderer escapes HTML, so MDX component tags would show as text.
 * For the live preview, turn them into plain Markdown: a titled opening tag
 * becomes a bold line, the rest disappear, and the indentation used inside
 * components is removed so it doesn't read as an indented code block.
 */
function previewMarkdown(source: string) {
  let depth = 0;
  return source
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      const tagsOnly = trimmed !== "" && trimmed.replace(COMPONENT_TAG, "").trim() === "";
      const opens = [...trimmed.matchAll(COMPONENT_TAG)];
      const indent = "  ".repeat(depth);
      const text = line.startsWith(indent) ? line.slice(indent.length) : line.trimStart();
      for (const tag of opens) {
        if (tag[0].startsWith("</")) depth = Math.max(0, depth - 1);
        else if (!tag[0].endsWith("/>")) depth++;
      }
      // Single-line components (<Tip>Teks</Tip>) keep their text.
      const out = text.replace(COMPONENT_TAG, (_, _name, attrs: string) => {
        const title = /title="([^"]*)"/.exec(attrs)?.[1];
        return title ? `**${title}** ` : "";
      });
      return tagsOnly && out.trim() === "" ? "" : out;
    })
    .join("\n");
}

function DraftCard({ draft }: { draft: Draft }) {
  const Icon = draft.kind === "new" ? FilePlus2 : PencilLine;
  return (
    <div className="rounded-xl border border-dashed border-accent/50 bg-accent-soft/20 p-3" data-testid="proposal-draft">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-accent">
        <Icon className="size-3.5" />
        {draft.kind === "new" ? "Menulis halaman baru…" : "Menulis perubahan…"}
        <Loader2 className="size-3 animate-spin" />
      </p>
      {draft.title && <p className="text-sm font-semibold text-fg">{draft.title}</p>}
      {draft.description && <p className="mt-0.5 text-xs text-fg-muted">{draft.description}</p>}
      {draft.content && (
        <div
          className="chat-prose mt-2 border-t border-line pt-2 text-sm leading-relaxed text-fg"
          dangerouslySetInnerHTML={{ __html: renderChatMarkdown(previewMarkdown(draft.content)) }}
        />
      )}
      <p className="mt-2 text-[10px] text-fg-subtle">{draft.content.length} karakter · sedang menulis…</p>
    </div>
  );
}

function ProposalCard({
  proposal,
  current,
  onApply,
  onDismiss,
}: {
  proposal: ProposalState;
  current?: () => CurrentPage;
  onApply: (mode: ApplyMode, contentMarkdown?: string) => Promise<void>;
  onDismiss: () => void;
}) {
  const isNew = proposal.kind === "new";
  const targeted = Boolean(proposal.target);
  const page = proposal.kind === "edit" && !targeted ? current?.() : undefined;
  const done = proposal.status === "applied";
  // Edits open on the diff; new pages on their content preview.
  const base = proposal.baseMarkdown ?? page?.markdown;
  const canDiff = !isNew && Boolean(proposal.contentMarkdown) && base !== undefined;
  const [open, setOpen] = useState(canDiff && !done);
  const [tab, setTab] = useState<"diff" | "preview" | "raw">(canDiff ? "diff" : "preview");
  const [pending, setPending] = useState<ApplyMode | null>(null);
  /** Markdown with only the kept sections; undefined while everything is kept. */
  const [partial, setPartial] = useState<string | undefined>(undefined);
  const Icon = isNew ? FilePlus2 : PencilLine;
  const appliable = isNew || targeted || Boolean(current);
  // A dated proposal is scheduled by default; otherwise the main action only creates a draft.
  const actions: { mode: ApplyMode; label: string }[] = !isNew
    ? [{ mode: "draft", label: partial !== undefined ? "Terapkan bagian terpilih" : targeted ? "Terapkan ke draf halaman" : "Terapkan" }]
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
    if (
      mode === "publish" &&
      !(await confirmDialog({
        title: "Buat dan langsung terbitkan?",
        message: "Halaman baru ini langsung tampil untuk pengunjung. Pilih “Buat draf” bila ingin memeriksanya dulu.",
        confirmLabel: "Buat & terbitkan",
      }))
    )
      return;
    setPending(mode);
    await onApply(mode, partial);
    setPending(null);
  }

  const tabs: { id: "diff" | "preview" | "raw"; label: string }[] = [
    ...(canDiff ? [{ id: "diff" as const, label: "Perbedaan" }] : []),
    { id: "preview", label: "Pratinjau" },
    { id: "raw", label: "Markdown" },
  ];

  return (
    <div
      className={`rounded-xl border p-3 ${done ? "border-emerald-300/60 bg-emerald-50/50 dark:bg-emerald-950/20" : "border-accent/40 bg-accent-soft/30"}`}
      data-testid="proposal-card"
    >
      <p className="mb-2 flex flex-wrap items-center gap-1.5 text-xs font-medium text-accent">
        <Icon className="size-3.5" />
        {isNew ? "Usulan halaman baru" : "Usulan perubahan halaman"}
        {proposal.target && (
          <Link href={`/admin/pages/${proposal.target.id}`} className="inline-flex min-w-0 items-center gap-1 rounded-md bg-surface px-1.5 py-0.5 font-normal text-fg-muted hover:text-fg">
            <FileText className="size-3 shrink-0" />
            <span className="truncate">{proposal.target.title}</span>
          </Link>
        )}
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
              <div className="mt-1 overflow-hidden rounded-lg border border-line bg-page">
                <div className="flex gap-1 border-b border-line px-2 py-1" role="tablist">
                  {tabs.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={tab === item.id}
                      onClick={() => setTab(item.id)}
                      className={`rounded px-2 py-0.5 text-[11px] ${tab === item.id ? "bg-fill font-medium text-fg" : "text-fg-subtle hover:text-fg"}`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                {tab === "diff" && canDiff ? (
                  <div className="p-2">
                    <ProposalDiff
                      base={base ?? ""}
                      proposed={proposal.contentMarkdown}
                      mode={proposal.contentMode === "append" ? "append" : "replace"}
                      selectable={!done && proposal.status !== "dismissed" && proposal.contentMode !== "append"}
                      onChange={(markdown, all) => setPartial(all ? undefined : markdown)}
                    />
                  </div>
                ) : tab === "raw" ? (
                  <pre className="max-h-80 overflow-auto p-2 font-mono text-[11px] whitespace-pre-wrap text-fg-muted">{proposal.contentMarkdown}</pre>
                ) : (
                  <div
                    className="chat-prose max-h-80 overflow-auto p-3 text-sm leading-relaxed text-fg"
                    dangerouslySetInnerHTML={{ __html: renderChatMarkdown(previewMarkdown(proposal.contentMarkdown)) }}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {proposal.error && <p className="mt-2 text-xs text-red-600">{proposal.error}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {done ? (
          <span className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
            <Check className="size-3.5" />
            {isNew
              ? DONE[proposal.pageStatus ?? "draft"]
              : targeted
                ? "Diterapkan ke draf halaman itu (belum terbit). Versi sebelumnya ada di Riwayat revisi."
                : "Diterapkan. Batalkan dengan Ctrl+Z atau dari Riwayat revisi."}
            {(proposal.draftId || proposal.target) && (
              <Link href={`/admin/pages/${proposal.draftId ?? proposal.target?.id}`} className="ml-1 font-medium underline">
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
                disabled={pending !== null || !appliable}
                title={appliable ? undefined : "Buka halaman ini di editor untuk menerapkan perubahannya."}
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
