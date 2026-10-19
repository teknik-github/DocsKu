"use client";

import { useState } from "react";
import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { BubbleMenu, FloatingMenu } from "@tiptap/react/menus";
import { useEditorState } from "@tiptap/react";
import { AI_ACTIONS, type AiActionId } from "@/lib/ai/presets";
import {
  Bold,
  Code,
  Italic,
  Link as LinkIcon,
  Plus,
  Sparkles,
  Strikethrough,
  Trash2,
  Unlink,
} from "lucide-react";

const menuClass = "flex items-center gap-0.5 rounded-lg border border-line bg-surface p-1 shadow-lg";

function MenuButton({
  active,
  onClick,
  label,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`inline-flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-xs transition-colors ${
        active ? "bg-fill text-accent" : "text-fg-muted hover:bg-fill hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

export function TextBubbleMenu({ editor, onAi }: { editor: Editor; onAi?: (action: AiActionId) => void }) {
  const [linkMode, setLinkMode] = useState(false);
  const [aiMenu, setAiMenu] = useState(false);
  const [href, setHref] = useState("");
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      link: e.isActive("link"),
      href: (e.getAttributes("link").href as string | undefined) ?? "",
    }),
  });

  function applyLink() {
    const value = href.trim();
    if (!value) editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: value }).run();
    setLinkMode(false);
  }

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="textMenu"
      options={{ placement: "top", offset: 8, onHide: () => setAiMenu(false) }}
      shouldShow={({ editor: e, state: s }) =>
        !s.selection.empty && e.isEditable && !e.isActive("codeBlock") && !e.isActive("image") && s.selection instanceof TextSelection
      }
      className={menuClass}
    >
      {aiMenu && onAi ? (
        <div className="w-56 py-0.5">
          {AI_ACTIONS.map((action) => (
            <button
              key={action.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setAiMenu(false);
                onAi(action.id);
              }}
              className="block w-full rounded-md px-2.5 py-1.5 text-left text-xs text-fg hover:bg-fill"
            >
              {action.label}
            </button>
          ))}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setAiMenu(false);
              onAi("custom");
            }}
            className="mt-0.5 block w-full rounded-md border-t border-line px-2.5 py-1.5 text-left text-xs text-accent hover:bg-fill"
          >
            Instruksi sendiri…
          </button>
        </div>
      ) : linkMode ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            applyLink();
          }}
          className="flex items-center gap-1"
        >
          <input
            autoFocus
            value={href}
            onChange={(e) => setHref(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setLinkMode(false)}
            placeholder="https://… atau /docs/…"
            className="h-7 w-64 rounded-md border border-line bg-page px-2 text-xs outline-none focus:border-accent"
          />
          <button type="submit" className="h-7 rounded-md bg-fg px-2 text-xs text-page">
            Simpan
          </button>
        </form>
      ) : (
        <>
          {onAi && (
            <>
              <MenuButton label="AI" onClick={() => setAiMenu(true)}>
                <Sparkles className="size-3.5 text-accent" />
                <span className="ml-1 font-medium text-accent">AI</span>
              </MenuButton>
              <span className="mx-0.5 h-4 w-px bg-line" />
            </>
          )}
          <MenuButton label="Tebal" active={state.bold} onClick={() => editor.chain().focus().toggleBold().run()}>
            <Bold className="size-3.5" />
          </MenuButton>
          <MenuButton label="Miring" active={state.italic} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <Italic className="size-3.5" />
          </MenuButton>
          <MenuButton label="Coret" active={state.strike} onClick={() => editor.chain().focus().toggleStrike().run()}>
            <Strikethrough className="size-3.5" />
          </MenuButton>
          <MenuButton label="Kode" active={state.code} onClick={() => editor.chain().focus().toggleCode().run()}>
            <Code className="size-3.5" />
          </MenuButton>
          <span className="mx-0.5 h-4 w-px bg-line" />
          <MenuButton
            label="Tautan"
            active={state.link}
            onClick={() => {
              setHref(state.href);
              setLinkMode(true);
            }}
          >
            <LinkIcon className="size-3.5" />
          </MenuButton>
          {state.link && (
            <MenuButton label="Hapus tautan" onClick={() => editor.chain().focus().extendMarkRange("link").unsetLink().run()}>
              <Unlink className="size-3.5" />
            </MenuButton>
          )}
        </>
      )}
    </BubbleMenu>
  );
}

export function TableBubbleMenu({ editor }: { editor: Editor }) {
  const run = (fn: (chain: ReturnType<Editor["chain"]>) => ReturnType<Editor["chain"]>) => fn(editor.chain().focus()).run();
  return (
    <BubbleMenu
      editor={editor}
      pluginKey="tableMenu"
      options={{ placement: "top", offset: 8 }}
      shouldShow={({ editor: e }) => e.isEditable && e.isActive("table")}
      className={menuClass}
    >
      <MenuButton label="Tambah baris" onClick={() => run((c) => c.addRowAfter())}>+ Baris</MenuButton>
      <MenuButton label="Tambah kolom" onClick={() => run((c) => c.addColumnAfter())}>+ Kolom</MenuButton>
      <MenuButton label="Hapus baris" onClick={() => run((c) => c.deleteRow())}>− Baris</MenuButton>
      <MenuButton label="Hapus kolom" onClick={() => run((c) => c.deleteColumn())}>− Kolom</MenuButton>
      <MenuButton label="Baris judul" onClick={() => run((c) => c.toggleHeaderRow())}>Judul</MenuButton>
      <span className="mx-0.5 h-4 w-px bg-line" />
      <MenuButton label="Hapus tabel" onClick={() => run((c) => c.deleteTable())}>
        <Trash2 className="size-3.5" />
      </MenuButton>
    </BubbleMenu>
  );
}

export function ImageBubbleMenu({ editor }: { editor: Editor }) {
  const alt = useEditorState({
    editor,
    selector: ({ editor: e }) => (e.isActive("image") ? ((e.getAttributes("image").alt as string) ?? "") : ""),
  });
  return (
    <BubbleMenu
      editor={editor}
      pluginKey="imageMenu"
      options={{ placement: "top", offset: 8 }}
      shouldShow={({ editor: e }) => e.isEditable && e.isActive("image")}
      className={menuClass}
    >
      <input
        value={alt}
        onChange={(e) => editor.commands.updateAttributes("image", { alt: e.target.value })}
        placeholder="Teks alternatif (alt)"
        className="h-7 w-56 rounded-md border border-line bg-page px-2 text-xs outline-none focus:border-accent"
      />
      <MenuButton label="Hapus gambar" onClick={() => editor.chain().focus().deleteSelection().run()}>
        <Trash2 className="size-3.5" />
      </MenuButton>
    </BubbleMenu>
  );
}

/** "+" next to an empty top-level line; opens the same menu as typing "/". */
export function BlockInsertMenu({ editor }: { editor: Editor }) {
  return (
    <FloatingMenu
      editor={editor}
      pluginKey="insertMenu"
      options={{ placement: "left", offset: 12 }}
      shouldShow={({ editor: e, state }) => {
        const { $from, empty } = state.selection;
        return e.isEditable && empty && $from.depth === 1 && $from.parent.type.name === "paragraph" && $from.parent.content.size === 0;
      }}
    >
      <button
        type="button"
        aria-label="Sisipkan blok"
        title="Sisipkan blok"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().insertContent("/").run()}
        className="inline-flex size-7 items-center justify-center rounded-full border border-line bg-surface text-fg-muted shadow-sm hover:border-accent hover:text-accent"
      >
        <Plus className="size-4" />
      </button>
    </FloatingMenu>
  );
}
