"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Editor, JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import { ArrowLeft, Eye, ImagePlus, ListChecks, Loader2, MessageSquareText, Settings2, Sparkles, X } from "lucide-react";
import {
  discardChanges,
  loadLatestDraft,
  publishPage,
  restoreRevision,
  saveDraft,
  suggestSlug,
  unpublishPage,
  updateSlug,
} from "@/app/admin/_actions/pages";
import {
  Accordion,
  Callout,
  Card,
  CardGroup,
  CodeBlockNode,
  CodeGroup,
  Hero,
  Step,
  Steps,
  Tab,
  Tabs,
} from "@/components/admin/editor/nodes";
import { SlashCommand } from "@/components/admin/editor/slash-command";
import { BlockInsertMenu, ImageBubbleMenu, TableBubbleMenu, TextBubbleMenu } from "@/components/admin/editor/menus";
import { ImageDialog, uploadImage } from "@/components/admin/editor/image-dialog";
import { EditorMoreMenu } from "@/components/admin/editor/more-menu";
import { PublishMenu } from "@/components/admin/editor/publish-menu";
import { AiPanel, type AiJob } from "@/components/admin/editor/ai-panel";
import { AiChat } from "@/components/admin/ai-chat";
import type { CurrentPage, Proposal } from "@/lib/ai/agent";
import { BlockHandle, BlockHover, createHoverBus } from "@/components/admin/editor/block-handle";
import { streamAi } from "@/components/admin/editor/ai-client";
import { toMarkdown } from "@/lib/content/markdown";
import type { AiActionId } from "@/lib/ai/presets";
import type { PageSeo } from "@/lib/site-types";
import { SettingsPanel, type EditorNavigation, type RevisionItem } from "@/components/admin/editor/settings-panel";
import { StatusBadge, buttonClass } from "@/components/admin/ui";
import { EditorOutline, InlineEditorOutline } from "@/components/admin/editor/editor-outline";
import { ApprovalBanner, ConflictBanner, PresenceAvatars, SubmitButton, usePresence, type Conflict } from "@/components/admin/editor/collab";
import { approvePage, requestChanges, submitForApproval, withdrawSubmission } from "@/app/admin/_actions/approval";
import { confirmDialog, promptDialog } from "@/components/admin/dialog";
import type { ApprovalInfo } from "@/lib/collab/approval";
import { NoteHighlights } from "@/components/admin/editor/note-highlights";
import { ReviewPanel, usePageNotes, type ReviewTab } from "@/components/admin/editor/review-panel";
import { checkQuality } from "@/components/admin/editor/quality";

export type EditorPage = {
  id: string;
  kind: "doc" | "home";
  slug: string;
  status: "draft" | "scheduled" | "published";
  publishedAt: string | null;
  hasChanges: boolean;
  title: string;
  description: string;
  content: JSONContent;
  seo: PageSeo;
  cover: string | null;
  featured: boolean;
  visibility: "public" | "internal";
  updatedAt: string;
  /** Working-copy version this editor loaded; sent with every save to detect conflicting edits. */
  draftVersion: number;
  approval: ApprovalInfo;
};

/** What this person may do here (lib/auth/permissions.ts); the server checks again. */
export type EditorPermissions = { publish: boolean; approve: boolean; staff: boolean; templates: boolean };

type SaveState = "saved" | "dirty" | "saving" | "error";

const SAVE_LABEL: Record<SaveState, string> = {
  saved: "Tersimpan",
  dirty: "Belum disimpan…",
  saving: "Menyimpan…",
  error: "Gagal menyimpan",
};

const AUTOSAVE_MS = 1200;

/**
 * The editor's JSON as plain objects. ProseMirror builds node attrs with a null
 * prototype, which server action serialization silently drops.
 */
function docJSON(editor: Editor): JSONContent {
  return JSON.parse(JSON.stringify(editor.getJSON()));
}

/** Grows a textarea to fit its content. */
function autosize(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

export function PageEditor({
  page,
  revisions,
  aiEnabled = false,
  navigation,
  isAdmin = false,
  permissions = { publish: true, approve: true, staff: true, templates: true },
  viewer,
}: {
  page: EditorPage;
  revisions: RevisionItem[];
  /** AI Write is configured; shows "/ai", the AI button on selections, and description help. */
  aiEnabled?: boolean;
  navigation: EditorNavigation;
  /** Admins also get a link to the page's activity log. */
  isAdmin?: boolean;
  permissions?: EditorPermissions;
  viewer?: { id: string; name: string };
}) {
  const router = useRouter();
  const [title, setTitle] = useState(page.title);
  const [description, setDescription] = useState(page.description);
  const [seo, setSeo] = useState<PageSeo>(page.seo);
  const [cover, setCover] = useState<string | null>(page.cover);
  const [coverDialog, setCoverDialog] = useState(false);
  const [slug, setSlug] = useState(page.slug);
  const [status, setStatus] = useState(page.status);
  const [publishedAt, setPublishedAt] = useState(page.publishedAt);
  const [hasChanges, setHasChanges] = useState(page.hasChanges);
  const [savedAt, setSavedAt] = useState(page.updatedAt);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  /** What automation filled in on the last publish (lib/automation.ts). */
  const [autoNote, setAutoNote] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  /** "Periksa": writing checks and internal notes. */
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewTab, setReviewTab] = useState<ReviewTab>("quality");
  /** Text picked with the bubble menu's note button, waiting for its note. */
  const [draftQuote, setDraftQuote] = useState<string | null>(null);
  const [activeNote, setActiveNote] = useState<string | null>(null);
  /** Opens one side panel and closes the others. */
  function openSide(side: "settings" | "chat" | "review" | null) {
    setPanelOpen(side === "settings");
    setChatOpen(side === "chat");
    setReviewOpen(side === "review");
  }
  /** A click on a highlighted quote in the text opens its note (set once the editor exists). */
  const selectNote = useRef<(id: string) => void>(() => {});
  const [imageDialog, setImageDialog] = useState(false);
  const [aiJob, setAiJob] = useState<AiJob | null>(null);
  const [describing, setDescribing] = useState(false);
  const isHome = page.kind === "home";
  const backHref = isHome ? "/admin/home" : "/admin/pages";

  // Autosave state lives in refs so the editor's callbacks always see current values.
  const titleRef = useRef(page.title);
  const descriptionRef = useRef(page.description);
  const seoRef = useRef<PageSeo>(page.seo);
  const coverRef = useRef<string | null>(page.cover);
  const editorRef = useRef<Editor | null>(null);
  const version = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const inFlight = useRef<Promise<unknown> | null>(null);
  const contentBroken = useRef(false);
  const [hoverBus] = useState(createHoverBus);
  /** The working-copy version on the server that this editor's content is based on. */
  const serverVersion = useRef(page.draftVersion);
  /** Set while a save was refused because someone else saved in between: autosave pauses. */
  const conflictRef = useRef(false);
  const [conflict, setConflict] = useState<{ info: Conflict; mode: "conflict" | "stale" } | null>(null);
  const [approval, setApproval] = useState<ApprovalInfo>(page.approval);
  /** A newer version the person chose to ignore ("Abaikan"): not announced again. */
  const dismissedVersion = useRef(0);
  const others = usePresence(page.id, (remote) => {
    // The heartbeat saw a newer save than ours (another person, or another tab).
    // While our own save is in flight its new version may arrive here first: ignore that.
    if (inFlight.current || busy) return;
    if (remote.version > Math.max(serverVersion.current, dismissedVersion.current) && !conflictRef.current) {
      setConflict((shown) => shown ?? { info: remote, mode: "stale" });
    }
  });

  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2500);
  }

  /** The editor's current working copy, as sent to the server. */
  function localDraft() {
    const editor = editorRef.current;
    if (!editor) return null;
    return { title: titleRef.current, description: descriptionRef.current, content: docJSON(editor), seo: seoRef.current, cover: coverRef.current };
  }

  async function save(revision = false, force = false): Promise<boolean> {
    window.clearTimeout(timer.current);
    if (inFlight.current) await inFlight.current;
    const editor = editorRef.current;
    if (!editor || contentBroken.current) return false;
    // After a conflict nothing saves until the person picks "Muat" or "Timpa".
    if (conflictRef.current && !force) return false;
    const startVersion = version.current;
    setSaveState("saving");
    const request = saveDraft(page.id, localDraft()!, revision, { expectedVersion: serverVersion.current, force });
    inFlight.current = request;
    const result = await request.catch(() => ({ ok: false as const, error: "Tidak bisa terhubung ke server.", conflict: undefined }));
    inFlight.current = null;
    if (!result.ok) {
      if (result.conflict) {
        conflictRef.current = true;
        setConflict({ info: result.conflict, mode: "conflict" });
        setSaveState("dirty");
        return false;
      }
      setSaveState("error");
      setError(result.error);
      return false;
    }
    if (result.version !== undefined) serverVersion.current = result.version;
    if (force) {
      conflictRef.current = false;
      setConflict(null);
    }
    setError("");
    setHasChanges(result.hasChanges);
    setSavedAt(result.savedAt);
    if (version.current === startVersion) setSaveState("saved");
    else scheduleSave();
    return true;
  }

  function scheduleSave() {
    window.clearTimeout(timer.current);
    setSaveState("dirty");
    if (conflictRef.current) return;
    timer.current = window.setTimeout(() => void save(), AUTOSAVE_MS);
  }

  function markDirty() {
    if (contentBroken.current) return;
    version.current++;
    scheduleSave();
  }

  async function insertUploaded(files: File[], editor: Editor) {
    for (const file of files) {
      try {
        const image = await uploadImage(file);
        editor.chain().focus().setImage({ src: image.url, alt: file.name.replace(/\.[^.]+$/, "") }).run();
      } catch (e) {
        setError((e as Error).message);
      }
    }
  }

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        codeBlock: false,
        dropcursor: { color: "var(--accent)", width: 2, class: "editor-dropcursor" },
        link: { openOnClick: false, autolink: true, protocols: ["http", "https", "mailto"] },
      }),
      CodeBlockNode,
      Image.configure({ inline: false }),
      TableKit.configure({ table: { resizable: false } }),
      Placeholder.configure({
        placeholder: ({ node }) => (node.type.name === "heading" ? "Judul" : "Ketik / untuk menyisipkan blok…"),
      }),
      Callout,
      CardGroup,
      Card,
      Steps,
      Step,
      Tabs,
      Tab,
      CodeGroup,
      Accordion,
      Hero,
      BlockHover.configure({ bus: hoverBus }),
      NoteHighlights.configure({ onSelect: (id) => selectNote.current(id) }),
      SlashCommand.configure({
        requestImage: () => setImageDialog(true),
        requestAi: aiEnabled ? (pos) => setAiJob({ action: "write", from: pos, to: pos }) : undefined,
        home: page.kind === "home",
      }),
    ],
    content: page.content,
    // A document with unknown blocks must never be replaced by an empty one and autosaved.
    enableContentCheck: true,
    onContentError: ({ editor, error }) => {
      contentBroken.current = true;
      editor.setEditable(false);
      setError(`Isi halaman tidak bisa dimuat dengan aman, jadi editor dikunci dan tidak menyimpan apa pun. (${error.message})`);
    },
    editorProps: {
      attributes: { class: "prose-docs editor-content min-h-[50vh] pb-40 outline-none" },
      handlePaste: (_, event) => {
        const files = [...(event.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
        if (!files.length || !editorRef.current) return false;
        void insertUploaded(files, editorRef.current);
        return true;
      },
      handleDrop: (_, event) => {
        const files = [...((event as DragEvent).dataTransfer?.files ?? [])].filter((f) => f.type.startsWith("image/"));
        if (!files.length || !editorRef.current) return false;
        event.preventDefault();
        void insertUploaded(files, editorRef.current);
        return true;
      },
    },
    onCreate: ({ editor }) => {
      editorRef.current = editor;
    },
    onUpdate: () => markDirty(),
  });

  const notes = usePageNotes(page.id, editor, activeNote);
  useEffect(() => {
    selectNote.current = (id) => {
      setActiveNote(id);
      setReviewTab("notes");
      openSide("review");
    };
  });

  /**
   * Publishing with open writing problems (errors and warnings from "Periksa") asks first;
   * "Periksa dulu" opens the list instead. Notes still open are mentioned too.
   */
  async function publishChecked(when: string | null) {
    const current = editorRef.current;
    if (current && !isHome) {
      const problems = checkQuality({ title: titleRef.current, description: descriptionRef.current, seoTitle: seoRef.current.title, seoDescription: seoRef.current.description, doc: current.state.doc }).issues.filter(
        (issue) => issue.level !== "info",
      );
      if (problems.length > 0 || notes.open > 0) {
        const parts = [
          problems.length ? `${problems.length} catatan kualitas (misalnya: ${problems[0].message.replace(/\.$/, "")})` : "",
          notes.open ? `${notes.open} catatan tim yang belum selesai` : "",
        ].filter(Boolean);
        const go = await confirmDialog({
          title: when ? "Jadwalkan meski ada catatan?" : "Terbitkan meski ada catatan?",
          message: `Halaman ini masih punya ${parts.join(" dan ")}.`,
          confirmLabel: when ? "Jadwalkan saja" : "Terbitkan saja",
          cancelLabel: "Periksa dulu",
        });
        if (!go) {
          setReviewTab(problems.length ? "quality" : "notes");
          openSide("review");
          return false;
        }
      }
    }
    return publish(when);
  }

  // Ctrl/Cmd+S saves a revision; leaving with unsaved edits asks first.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save(true).then((ok) => {
          if (ok) {
            flash("Revisi disimpan");
            router.refresh();
          }
        });
      }
    }
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (saveState !== "saved") event.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  });

  /** "Muat versi terbaru": keeps this editor's copy as a revision, then loads the saved one. */
  async function reloadLatest() {
    setBusy(true);
    const result = await loadLatestDraft(page.id, localDraft());
    setBusy(false);
    if (!result.ok) return setError(result.error);
    conflictRef.current = false;
    setConflict(null);
    serverVersion.current = result.version;
    loadDraft(result.draft);
    setHasChanges(result.hasChanges);
    flash("Versi terbaru dimuat");
    router.refresh();
  }

  async function overwrite() {
    const ok = await confirmDialog({
      title: "Timpa dengan versi Anda?",
      message: "Versi yang disimpan orang lain akan diganti dengan isi editor ini. Versi mereka tetap tersimpan di Riwayat revisi.",
      confirmLabel: "Timpa",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    const saved = await save(true, true);
    setBusy(false);
    if (saved) {
      flash("Versi Anda disimpan");
      router.refresh();
    }
  }

  async function submit() {
    if (!(await save())) return;
    const note = await promptDialog({
      title: "Ajukan untuk ditinjau",
      message: "Editor atau admin akan meninjau lalu menerbitkan halaman ini, atau meminta perubahan.",
      label: "Catatan untuk peninjau (opsional)",
      placeholder: "Mis. sudah saya cek ulang langkah instalasinya",
      confirmLabel: "Ajukan",
      optional: true,
    });
    if (note === null) return;
    setBusy(true);
    const result = await submitForApproval(page.id, note);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setApproval({ status: "pending", note: note || null, requestedBy: viewer?.name ?? null, requestedById: viewer?.id ?? null, requestedAt: new Date().toISOString() });
    flash("Diajukan untuk ditinjau");
    router.refresh();
  }

  async function withdraw() {
    const ok = await confirmDialog({ title: "Batalkan pengajuan?", message: "Halaman tidak lagi menunggu persetujuan. Anda bisa mengajukannya lagi nanti.", confirmLabel: "Batalkan pengajuan" });
    if (!ok) return;
    setBusy(true);
    const result = await withdrawSubmission(page.id);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setApproval(null);
    flash("Pengajuan dibatalkan");
    router.refresh();
  }

  async function approve() {
    // Approving publishes what is saved: save this editor's edits first.
    if (!(await save())) return;
    setBusy(true);
    const result = await approvePage(page.id, serverVersion.current);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    if (result.version !== undefined) serverVersion.current = result.version;
    if (result.slug) setSlug(result.slug);
    setApproval(null);
    setStatus("published");
    setHasChanges(false);
    flash("Disetujui dan diterbitkan");
    router.refresh();
  }

  async function askForChanges() {
    const note = await promptDialog({
      title: "Minta perubahan",
      message: "Pengaju melihat catatan ini di editor dan bisa mengajukan lagi setelah memperbaikinya.",
      label: "Apa yang perlu diubah?",
      placeholder: "Mis. tambahkan langkah verifikasi setelah instalasi",
      confirmLabel: "Kirim",
    });
    if (!note) return;
    setBusy(true);
    const result = await requestChanges(page.id, note);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setApproval((current) => (current ? { ...current, status: "changes_requested", note } : current));
    flash("Permintaan perubahan dikirim");
    router.refresh();
  }

  function loadDraft(draft: { title: string; description: string; content: JSONContent; seo?: PageSeo; cover?: string | null }) {
    seoRef.current = draft.seo ?? {};
    setSeo(seoRef.current);
    coverRef.current = draft.cover ?? null;
    setCover(coverRef.current);
    titleRef.current = draft.title;
    descriptionRef.current = draft.description;
    setTitle(draft.title);
    setDescription(draft.description);
    editorRef.current?.commands.setContent(draft.content, { emitUpdate: false });
    window.clearTimeout(timer.current);
    setSaveState("saved");
  }

  async function publish(when: string | null) {
    window.clearTimeout(timer.current);
    if (inFlight.current) await inFlight.current;
    const editor = editorRef.current;
    if (!editor || contentBroken.current) return false;
    setBusy(true);
    const startVersion = version.current;
    if (conflictRef.current) return false;
    const result = await publishPage(page.id, localDraft()!, when, serverVersion.current);
    setBusy(false);
    if (!result.ok) {
      if ("conflict" in result && result.conflict) {
        conflictRef.current = true;
        setConflict({ info: result.conflict, mode: "conflict" });
        return false;
      }
      setError(result.error);
      return false;
    }
    serverVersion.current = result.version;
    setApproval(null);
    setError("");
    setStatus(result.status);
    setPublishedAt(result.publishedAt);
    const { filled } = result;
    if (filled.description) {
      descriptionRef.current = filled.description;
      setDescription(filled.description);
    }
    if (filled.seo) {
      seoRef.current = filled.seo;
      setSeo(filled.seo);
    }
    if (filled.slug) setSlug(result.slug);
    const scheduled = result.status === "scheduled";
    setAutoNote(
      [
        filled.description && "deskripsi ditulis AI",
        filled.seo && "meta title/description ditulis AI",
        filled.slug && `URL menjadi /docs/${filled.slug}`,
        filled.section && `${scheduled ? "akan ditambahkan" : "ditambahkan"} ke navigasi: ${filled.section}`,
      ]
        .filter(Boolean)
        .join(" · "),
    );
    setHasChanges(false);
    setSavedAt(result.savedAt);
    if (version.current === startVersion) setSaveState("saved");
    flash(result.status === "scheduled" ? "Halaman dijadwalkan" : "Halaman diterbitkan");
    router.refresh();
    return true;
  }

  async function unpublish() {
    setBusy(true);
    const result = await unpublishPage(page.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    setStatus("draft");
    setHasChanges(false);
    flash("Halaman ditarik dari situs");
    router.refresh();
    return true;
  }

  async function discard() {
    setBusy(true);
    const result = await discardChanges(page.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    if (result.version !== undefined) serverVersion.current = result.version;
    loadDraft(result.draft);
    setHasChanges(false);
    flash("Perubahan dibuang");
    return true;
  }

  async function restore(revisionId: string) {
    // Save pending edits first: the server keeps them as a "before-restore" revision.
    await save();
    const result = await restoreRevision(page.id, revisionId);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (result.version !== undefined) serverVersion.current = result.version;
    loadDraft(result.draft);
    setHasChanges(status !== "draft");
    flash("Revisi dipulihkan ke draf");
    router.refresh();
  }

  /** New pages get a slug from their first title. */
  async function maybeSuggestSlug() {
    if (isHome || status !== "draft" || !slug.startsWith("tanpa-judul") || !titleRef.current.trim()) return;
    const suggestion = await suggestSlug(page.id, titleRef.current);
    if (!suggestion) return;
    const result = await updateSlug(page.id, suggestion);
    if (result.ok) setSlug(result.slug);
  }

  /** Page title, description, and content (as Markdown) the AI writes with. */
  function aiContext() {
    const editor = editorRef.current;
    return {
      title: titleRef.current,
      description: descriptionRef.current,
      document: editor ? toMarkdown(docJSON(editor)).slice(0, 24_000) : "",
    };
  }

  function openAiOnSelection(action: AiActionId) {
    const editor = editorRef.current;
    if (!editor) return;
    const { from, to, $from, $to } = editor.state.selection;
    const slice = editor.state.selection.content().content.toJSON() ?? [];
    setAiJob({
      action,
      from,
      to,
      selection: toMarkdown({ type: "doc", content: slice }).trim(),
      inline: $from.parent === $to.parent && $from.parent.isTextblock,
    });
  }

  async function describeWithAi() {
    setDescribing(true);
    setError("");
    try {
      const text = await streamAi(
        // A new description each time; the provider's prompt cache still covers the page text.
        { action: "description", fresh: true, ...aiContext() },
        {
          onText: (value) => {
            descriptionRef.current = value.trim();
            setDescription(value.trim());
          },
        },
      );
      descriptionRef.current = text.trim().replace(/^["“]|["”]$/g, "");
      setDescription(descriptionRef.current);
      markDirty();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDescribing(false);
    }
  }

  /** The page as the AI Chat agent sees it: the current, possibly unsaved, working copy. */
  function currentPage(): CurrentPage {
    const editor = editorRef.current;
    return {
      id: page.id,
      kind: page.kind,
      slug,
      status,
      title: titleRef.current,
      description: descriptionRef.current,
      seo: seoRef.current,
      markdown: editor ? toMarkdown(docJSON(editor)) : "",
    };
  }

  /** Applies an AI Chat proposal, keeping a revision of the page as it was before. */
  async function applyProposal(proposal: Proposal) {
    const editor = editorRef.current;
    if (!editor || contentBroken.current) return;
    // Applying on top of someone else's newer save would lose one of the two: resolve the conflict first.
    if (!(await save(true))) {
      setError(conflictRef.current ? "Usulan belum diterapkan: halaman ini diubah orang lain. Muat versi terbaru atau timpa dulu, lalu terapkan lagi." : "Usulan belum diterapkan karena halaman gagal disimpan.");
      throw new Error("save failed");
    }
    if (proposal.title !== undefined) {
      titleRef.current = proposal.title;
      setTitle(proposal.title);
    }
    if (proposal.description !== undefined) {
      descriptionRef.current = proposal.description;
      setDescription(proposal.description);
    }
    if (proposal.seo) {
      seoRef.current = { ...seoRef.current, ...proposal.seo };
      setSeo(seoRef.current);
    }
    if (proposal.contentDoc?.content?.length) {
      if (proposal.contentMode === "append") {
        editor.chain().focus("end").insertContentAt(editor.state.doc.content.size, proposal.contentDoc.content).run();
      } else {
        editor.commands.setContent(proposal.contentDoc);
      }
    }
    markDirty();
    flash("Usulan AI diterapkan");
    router.refresh();
  }

  async function openPreview() {
    const preview = window.open("", "_blank");
    await save();
    if (preview) preview.location.href = `/preview/${page.id}`;
  }

  async function leave(event: React.MouseEvent) {
    if (saveState === "saved") return;
    event.preventDefault();
    await save();
    router.push(backHref);
  }

  return (
    <div className="min-h-screen">
      {/* Below `sm` the header keeps to one line: AI Chat and Pratinjau move into the "⋯" menu. */}
      <header className="sticky top-0 z-40 flex h-14 min-w-0 items-center gap-2 border-b border-line bg-page/95 px-3 backdrop-blur sm:gap-3 sm:px-4">
        <Link href={backHref} onClick={leave} aria-label={isHome ? "Kembali ke Beranda" : "Kembali ke Halaman"} className={`${buttonClass("ghost", "sm")} shrink-0`}>
          <ArrowLeft className="size-4" />
          <span className="hidden sm:inline">{isHome ? "Beranda" : "Halaman"}</span>
        </Link>
        <StatusBadge status={status} />
        {hasChanges && (
          <span className="hidden text-xs text-amber-600 sm:inline dark:text-amber-400">Perubahan belum terbit</span>
        )}
        <span
          className={`min-w-0 truncate text-xs ${saveState === "error" ? "text-red-600 dark:text-red-400" : "text-fg-subtle"}`}
          aria-live="polite"
        >
          {notice || SAVE_LABEL[saveState]}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <PresenceAvatars others={others} />
          <button
            type="button"
            onClick={() => openSide(reviewOpen ? null : "review")}
            aria-pressed={reviewOpen}
            title="Periksa kualitas tulisan dan catatan tim"
            className={`${buttonClass("ghost", "sm")} relative max-sm:hidden ${reviewOpen ? "bg-fill text-fg" : ""}`}
          >
            <ListChecks className="size-4" />
            <span className="hidden sm:inline">Periksa</span>
            {notes.open > 0 && (
              <span className="rounded-full bg-amber-500 px-1.5 text-[10px] font-semibold text-white tabular-nums" aria-label={`${notes.open} catatan terbuka`}>
                {notes.open}
              </span>
            )}
          </button>
          {aiEnabled && (
            <button
              type="button"
              onClick={() => openSide(chatOpen ? null : "chat")}
              aria-pressed={chatOpen}
              className={`${buttonClass("ghost", "sm")} max-sm:hidden ${chatOpen ? "bg-fill text-fg" : ""}`}
            >
              <MessageSquareText className="size-4 text-accent" />
              <span className="hidden sm:inline">AI Chat</span>
            </button>
          )}
          <button type="button" onClick={openPreview} className={`${buttonClass("ghost", "sm")} max-sm:hidden`}>
            <Eye className="size-4" />
            <span className="hidden sm:inline">Pratinjau</span>
          </button>
          {permissions.publish || isHome ? (
            <PublishMenu
              status={status}
              publishedAt={publishedAt}
              hasChanges={hasChanges}
              busy={busy}
              onPublish={publishChecked}
              onUnpublish={unpublish}
              onDiscard={discard}
            />
          ) : (
            <SubmitButton pending={approval?.status === "pending"} busy={busy} onSubmit={submit} onWithdraw={withdraw} />
          )}
          <EditorMoreMenu
            className="sm:hidden"
            items={[
              ...(aiEnabled
                ? [
                    {
                      label: "AI Chat",
                      icon: <MessageSquareText className="size-4 text-accent" />,
                      active: chatOpen,
                      onSelect: () => openSide(chatOpen ? null : "chat"),
                    },
                  ]
                : []),
              { label: "Periksa", icon: <ListChecks className="size-4" />, active: reviewOpen, onSelect: () => openSide(reviewOpen ? null : "review") },
              { label: "Pratinjau", icon: <Eye className="size-4" />, onSelect: openPreview },
            ]}
          />
          <button
            type="button"
            onClick={() => openSide(panelOpen ? null : "settings")}
            aria-label="Pengaturan halaman"
            aria-pressed={panelOpen}
            className={`inline-flex size-8 items-center justify-center rounded-lg ${panelOpen ? "bg-fill text-fg" : "text-fg-muted hover:bg-fill"}`}
          >
            <Settings2 className="size-4" />
          </button>
        </div>
      </header>

      {conflict && (
        <ConflictBanner
          conflict={conflict.info}
          mode={conflict.mode}
          busy={busy}
          onReload={reloadLatest}
          onOverwrite={overwrite}
          onDismiss={() => {
            // Treat their save as seen; a real clash still shows the conflict banner on the next save.
            dismissedVersion.current = conflict.info.version;
            setConflict(null);
          }}
        />
      )}
      {approval && !isHome && (
        <ApprovalBanner approval={approval} canApprove={permissions.approve} busy={busy} onApprove={approve} onRequestChanges={askForChanges} />
      )}

      {autoNote && (
        <div className="flex items-center justify-center gap-2 border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
          <Sparkles className="size-4 shrink-0" />
          <span>Otomatis: {autoNote}</span>
          <button type="button" onClick={() => setAutoNote("")} aria-label="Tutup" className="ml-1 inline-flex size-6 items-center justify-center rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/40">
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {error && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-center text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      <main className={`px-5 pt-12 transition-[padding] sm:px-8 ${panelOpen || reviewOpen ? "lg:pr-[24rem]" : chatOpen ? "lg:pr-[28rem]" : ""}`}>
        <div className="mx-auto max-w-3xl">
          <CoverPicker
            cover={cover}
            onPick={() => setCoverDialog(true)}
            onRemove={() => {
              coverRef.current = null;
              setCover(null);
              markDirty();
            }}
          />
          <textarea
            ref={autosize}
            value={title}
            rows={1}
            placeholder={isHome ? "Judul beranda (untuk tab browser)" : "Judul halaman"}
            onChange={(e) => {
              titleRef.current = e.target.value;
              setTitle(e.target.value);
              autosize(e.target);
              markDirty();
            }}
            onBlur={maybeSuggestSlug}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                editor?.commands.focus("start");
              }
            }}
            className="w-full resize-none overflow-hidden bg-transparent font-serif text-4xl font-light tracking-tight text-fg outline-none placeholder:text-fg-subtle"
          />
          <textarea
            ref={autosize}
            value={description}
            rows={1}
            placeholder={isHome ? "Deskripsi beranda untuk mesin pencari" : "Deskripsi singkat yang tampil di bawah judul"}
            onChange={(e) => {
              descriptionRef.current = e.target.value;
              setDescription(e.target.value);
              autosize(e.target);
              markDirty();
            }}
            className="mt-3 w-full resize-none overflow-hidden bg-transparent text-lg text-fg-muted outline-none placeholder:text-fg-subtle"
          />
          <div className="mt-2 mb-8 flex flex-wrap items-center gap-3">
            <p className="font-mono text-xs text-fg-subtle">{isHome ? "/ (beranda)" : `/docs/${slug}`}</p>
            {aiEnabled && (
              <button
                type="button"
                onClick={describeWithAi}
                disabled={describing}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-accent hover:bg-accent-soft disabled:opacity-60"
              >
                {describing ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                {describing ? "Menulis deskripsi…" : "Buat deskripsi dengan AI"}
              </button>
            )}
          </div>

          {editor && (
            <>
              <TextBubbleMenu
                editor={editor}
                onAi={aiEnabled ? openAiOnSelection : undefined}
                onNote={
                  isHome
                    ? undefined
                    : (quote) => {
                        setDraftQuote(quote);
                        setReviewTab("notes");
                        openSide("review");
                      }
                }
              />
              <TableBubbleMenu editor={editor} />
              <ImageBubbleMenu editor={editor} />
              <BlockInsertMenu editor={editor} />
            </>
          )}
          {/* Wide screens get the outline beside the page; others a collapsible one here. */}
          {editor && <InlineEditorOutline editor={editor} className={panelOpen || chatOpen || reviewOpen ? "min-[1760px]:hidden" : "xl:hidden"} />}
          <div className="relative" onMouseLeave={() => hoverBus.emit({ hover: null })}>
            <EditorContent editor={editor} />
            {editor && <BlockHandle editor={editor} bus={hoverBus} />}
          </div>
        </div>
      </main>
      {editor && <EditorOutline editor={editor} className={`hidden ${panelOpen || chatOpen || reviewOpen ? "min-[1760px]:block" : "xl:block"}`} />}

      {reviewOpen && editor && (
        <ReviewPanel
          editor={editor}
          tab={reviewTab}
          onTab={setReviewTab}
          title={title}
          description={description}
          seo={seo}
          isHome={isHome}
          pageId={page.id}
          viewer={viewer}
          canModerate={permissions.staff}
          notes={notes}
          draftQuote={draftQuote}
          onDraftQuoteDone={() => setDraftQuote(null)}
          activeNote={activeNote}
          onActiveNote={setActiveNote}
          onClose={() => {
            setReviewOpen(false);
            setActiveNote(null);
          }}
        />
      )}

      {chatOpen && (
        <aside className="fixed top-14 right-0 bottom-0 z-30 flex w-full max-w-md flex-col border-l border-line bg-page shadow-xl">
          <AiChat
            pageId={page.id}
            enabled={aiEnabled}
            getPage={currentPage}
            onApplyEdit={applyProposal}
            onClose={() => setChatOpen(false)}
          />
        </aside>
      )}

      {panelOpen && (
        <SettingsPanel
          pageId={page.id}
          isHome={isHome}
          slug={slug}
          status={status}
          publishedAt={publishedAt}
          savedAt={savedAt}
          revisions={revisions}
          onSlugChange={setSlug}
          featured={page.featured}
          visibility={page.visibility}
          navigation={navigation}
          aiEnabled={aiEnabled}
          seo={seo}
          onSeoChange={(next) => {
            seoRef.current = next;
            setSeo(next);
            markDirty();
          }}
          title={title}
          description={description}
          onRestore={restore}
          onFlush={() => save()}
          isAdmin={isAdmin}
          staff={permissions.staff}
          canTemplates={permissions.templates}
          onClose={() => setPanelOpen(false)}
        />
      )}

      {aiJob && editor && (
        <AiPanel
          key={`${aiJob.action}:${aiJob.from}:${aiJob.to}`}
          editor={editor}
          job={aiJob}
          context={aiContext}
          onClose={() => setAiJob(null)}
        />
      )}

      {coverDialog && (
        <ImageDialog
          onClose={() => setCoverDialog(false)}
          onSelect={({ url }) => {
            setCoverDialog(false);
            coverRef.current = url;
            setCover(url);
            markDirty();
          }}
        />
      )}

      {imageDialog && (
        <ImageDialog
          onClose={() => setImageDialog(false)}
          onSelect={({ url, alt }) => {
            setImageDialog(false);
            editor?.chain().focus().setImage({ src: url, alt }).run();
          }}
        />
      )}
    </div>
  );
}

/** Ghost-style feature image above the title. */
function CoverPicker({ cover, onPick, onRemove }: { cover: string | null; onPick: () => void; onRemove: () => void }) {
  if (!cover) {
    return (
      <button
        type="button"
        onClick={onPick}
        className="mb-4 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-fg-subtle hover:bg-fill hover:text-fg"
      >
        <ImagePlus className="size-3.5" />
        Tambah gambar sampul
      </button>
    );
  }
  return (
    <div className="group relative mb-8 overflow-hidden rounded-2xl border border-line">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={cover} alt="" className="aspect-[2.4/1] w-full object-cover" />
      <div className="absolute top-3 right-3 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <button type="button" onClick={onPick} className="rounded-md bg-black/60 px-2.5 py-1 text-xs text-white backdrop-blur hover:bg-black/75">
          Ganti
        </button>
        <button type="button" onClick={onRemove} className="rounded-md bg-black/60 px-2.5 py-1 text-xs text-white backdrop-blur hover:bg-black/75">
          Hapus
        </button>
      </div>
    </div>
  );
}
