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
import { ArrowLeft, Eye, ImagePlus, Loader2, MessageSquareText, Settings2, Sparkles, X } from "lucide-react";
import {
  discardChanges,
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
  updatedAt: string;
};

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
}: {
  page: EditorPage;
  revisions: RevisionItem[];
  /** AI Write is configured; shows "/ai", the AI button on selections, and description help. */
  aiEnabled?: boolean;
  navigation: EditorNavigation;
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
  const [imageDialog, setImageDialog] = useState(false);
  const [aiJob, setAiJob] = useState<AiJob | null>(null);
  const [describing, setDescribing] = useState(false);
  const isHome = page.kind === "home";
  const backHref = isHome ? "/admin" : "/admin/pages";

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

  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2500);
  }

  async function save(revision = false): Promise<boolean> {
    window.clearTimeout(timer.current);
    if (inFlight.current) await inFlight.current;
    const editor = editorRef.current;
    if (!editor || contentBroken.current) return false;
    const startVersion = version.current;
    setSaveState("saving");
    const request = saveDraft(
      page.id,
      { title: titleRef.current, description: descriptionRef.current, content: docJSON(editor), seo: seoRef.current, cover: coverRef.current },
      revision,
    );
    inFlight.current = request;
    const result = await request.catch(() => ({ ok: false as const, error: "Tidak bisa terhubung ke server." }));
    inFlight.current = null;
    if (!result.ok) {
      setSaveState("error");
      setError(result.error);
      return false;
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
    const result = await publishPage(
      page.id,
      { title: titleRef.current, description: descriptionRef.current, content: docJSON(editor), seo: seoRef.current, cover: coverRef.current },
      when,
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
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
    loadDraft(result.draft);
    setHasChanges(false);
    flash("Perubahan dibuang");
    return true;
  }

  async function restore(revisionId: string) {
    window.clearTimeout(timer.current);
    if (inFlight.current) await inFlight.current;
    const result = await restoreRevision(page.id, revisionId);
    if (!result.ok) {
      setError(result.error);
      return;
    }
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
    await save(true);
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
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-line bg-page/95 px-4 backdrop-blur">
        <Link href={backHref} onClick={leave} className={buttonClass("ghost", "sm")}>
          <ArrowLeft className="size-4" />
          <span className="hidden sm:inline">{isHome ? "Dasbor" : "Halaman"}</span>
        </Link>
        <StatusBadge status={status} />
        {hasChanges && (
          <span className="hidden text-xs text-amber-600 sm:inline dark:text-amber-400">Perubahan belum terbit</span>
        )}
        <span
          className={`text-xs ${saveState === "error" ? "text-red-600 dark:text-red-400" : "text-fg-subtle"}`}
          aria-live="polite"
        >
          {notice || SAVE_LABEL[saveState]}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {aiEnabled && (
            <button
              type="button"
              onClick={() => {
                setChatOpen(!chatOpen);
                setPanelOpen(false);
              }}
              aria-pressed={chatOpen}
              className={`${buttonClass("ghost", "sm")} ${chatOpen ? "bg-fill text-fg" : ""}`}
            >
              <MessageSquareText className="size-4 text-accent" />
              <span className="hidden sm:inline">AI Chat</span>
            </button>
          )}
          <button type="button" onClick={openPreview} className={buttonClass("ghost", "sm")}>
            <Eye className="size-4" />
            <span className="hidden sm:inline">Pratinjau</span>
          </button>
          <PublishMenu
            status={status}
            publishedAt={publishedAt}
            hasChanges={hasChanges}
            busy={busy}
            onPublish={publish}
            onUnpublish={unpublish}
            onDiscard={discard}
          />
          <button
            type="button"
            onClick={() => {
              setPanelOpen(!panelOpen);
              setChatOpen(false);
            }}
            aria-label="Pengaturan halaman"
            aria-pressed={panelOpen}
            className={`inline-flex size-8 items-center justify-center rounded-lg ${panelOpen ? "bg-fill text-fg" : "text-fg-muted hover:bg-fill"}`}
          >
            <Settings2 className="size-4" />
          </button>
        </div>
      </header>

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

      <main className={`px-5 pt-12 transition-[padding] sm:px-8 ${panelOpen ? "lg:pr-[24rem]" : chatOpen ? "lg:pr-[28rem]" : ""}`}>
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
              <TextBubbleMenu editor={editor} onAi={aiEnabled ? openAiOnSelection : undefined} />
              <TableBubbleMenu editor={editor} />
              <ImageBubbleMenu editor={editor} />
              <BlockInsertMenu editor={editor} />
            </>
          )}
          <div className="relative" onMouseLeave={() => hoverBus.emit({ hover: null })}>
            <EditorContent editor={editor} />
            {editor && <BlockHandle editor={editor} bus={hoverBus} />}
          </div>
        </div>
      </main>

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
