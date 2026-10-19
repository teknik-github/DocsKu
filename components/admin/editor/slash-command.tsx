"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { Extension, type Editor, type Range } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from "@tiptap/suggestion";
import { computePosition, flip, offset, shift } from "@floating-ui/dom";
import {
  ChevronRight,
  Code,
  Heading2,
  Heading3,
  Heading4,
  Image as ImageIcon,
  Info,
  LayoutGrid,
  List,
  ListOrdered,
  ListChecks,
  Minus,
  PanelTop,
  PanelsTopLeft,
  Pilcrow,
  Sparkles,
  Quote,
  SquareCode,
  Table,
  type LucideIcon,
} from "lucide-react";
import { templates } from "@/components/admin/editor/nodes";

export type SlashItem = {
  title: string;
  description: string;
  icon: LucideIcon;
  keywords: string;
  run: (editor: Editor, range: Range) => void;
};

/**
 * Every block that can be inserted with "/". `requestImage` opens the image
 * dialog; `requestAi`, when AI Write is enabled, opens the AI panel.
 */
export function slashItems(requestImage: () => void, requestAi?: (pos: number) => void, home = false): SlashItem[] {
  const insert = (content: ReturnType<(typeof templates)[keyof typeof templates]>) => (editor: Editor, range: Range) =>
    editor.chain().focus().deleteRange(range).insertContent(content).run();

  const ai: SlashItem[] = requestAi
    ? [
        {
          title: "Tulis dengan AI",
          description: "Minta AI menulis bagian baru",
          icon: Sparkles,
          keywords: "ai tulis write generate buat deepseek",
          run: (e, r) => {
            e.chain().focus().deleteRange(r).run();
            requestAi(r.from);
          },
        },
      ]
    : [];

  const homeOnly: SlashItem[] = home
    ? [{ title: "Hero", description: "Judul besar beranda dengan tombol dan kode", icon: PanelsTopLeft, keywords: "hero beranda home banner", run: insert(templates.hero()) }]
    : [];

  return [
    ...ai,
    ...homeOnly,
    { title: "Paragraf", description: "Teks biasa", icon: Pilcrow, keywords: "teks paragraph p", run: (e, r) => e.chain().focus().deleteRange(r).setParagraph().run() },
    { title: "Judul 2", description: "Judul bagian", icon: Heading2, keywords: "h2 heading judul", run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 2 }).run() },
    { title: "Judul 3", description: "Sub-bagian", icon: Heading3, keywords: "h3 heading judul", run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 3 }).run() },
    { title: "Judul 4", description: "Judul kecil", icon: Heading4, keywords: "h4 heading judul", run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 4 }).run() },
    { title: "Daftar berpoin", description: "Daftar tanpa urutan", icon: List, keywords: "bullet list ul poin", run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run() },
    { title: "Daftar bernomor", description: "Daftar berurutan", icon: ListOrdered, keywords: "ordered list ol nomor angka", run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run() },
    { title: "Kutipan", description: "Teks kutipan", icon: Quote, keywords: "quote blockquote kutip", run: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run() },
    { title: "Blok kode", description: "Kode dengan pewarnaan sintaks", icon: Code, keywords: "code kode snippet", run: (e, r) => e.chain().focus().deleteRange(r).setCodeBlock().run() },
    { title: "Grup kode", description: "Beberapa blok kode sebagai tab", icon: SquareCode, keywords: "code group tab kode", run: insert(templates.codeGroup()) },
    { title: "Callout", description: "Catatan, tip, peringatan", icon: Info, keywords: "callout note tip warning info catatan peringatan", run: insert(templates.callout()) },
    { title: "Kartu", description: "Grid kartu bertautan", icon: LayoutGrid, keywords: "card kartu grid", run: insert(templates.cards()) },
    { title: "Langkah", description: "Langkah-langkah bernomor", icon: ListChecks, keywords: "steps langkah tutorial", run: insert(templates.steps()) },
    { title: "Tab", description: "Konten dalam beberapa tab", icon: PanelTop, keywords: "tabs tab", run: insert(templates.tabs()) },
    { title: "Accordion", description: "Bagian yang bisa dibuka-tutup", icon: ChevronRight, keywords: "accordion faq lipat", run: insert(templates.accordion()) },
    { title: "Tabel", description: "Tabel 3×3", icon: Table, keywords: "table tabel", run: (e, r) => e.chain().focus().deleteRange(r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    {
      title: "Gambar",
      description: "Unggah atau pilih dari media",
      icon: ImageIcon,
      keywords: "image gambar foto media",
      run: (e, r) => {
        e.chain().focus().deleteRange(r).run();
        requestImage();
      },
    },
    { title: "Garis pemisah", description: "Pemisah horizontal", icon: Minus, keywords: "hr divider garis", run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run() },
  ];
}

type MenuHandle = { onKeyDown: (props: SuggestionKeyDownProps) => boolean };

const SlashMenu = forwardRef<MenuHandle, SuggestionProps<SlashItem>>(function SlashMenu(props, ref) {
  const [selected, setSelected] = useState(0);
  const [lastQuery, setLastQuery] = useState(props.query);
  if (props.query !== lastQuery) {
    // Reset the highlight whenever the filter changes.
    setLastQuery(props.query);
    setSelected(0);
  }

  const choose = (index: number) => {
    const item = props.items[index];
    if (item) props.command(item);
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === "ArrowDown") {
        setSelected((i) => (i + 1) % Math.max(props.items.length, 1));
        return true;
      }
      if (event.key === "ArrowUp") {
        setSelected((i) => (i - 1 + props.items.length) % Math.max(props.items.length, 1));
        return true;
      }
      if (event.key === "Enter") {
        choose(selected);
        return true;
      }
      return false;
    },
  }));

  if (props.items.length === 0) {
    return (
      <div className="w-64 rounded-xl border border-line bg-surface p-3 text-sm text-fg-subtle shadow-xl">
        Tidak ada blok yang cocok.
      </div>
    );
  }

  return (
    <div className="max-h-80 w-72 overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-xl">
      {props.items.map((item, i) => (
        <button
          key={item.title}
          type="button"
          ref={(el) => {
            if (el && i === selected) el.scrollIntoView({ block: "nearest" });
          }}
          onMouseEnter={() => setSelected(i)}
          onMouseDown={(e) => {
            e.preventDefault();
            choose(i);
          }}
          className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left ${i === selected ? "bg-fill" : ""}`}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-line bg-page text-fg-muted">
            <item.icon className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm text-fg">{item.title}</span>
            <span className="block truncate text-xs text-fg-subtle">{item.description}</span>
          </span>
        </button>
      ))}
    </div>
  );
});

export const SlashCommand = Extension.create<{ requestImage: () => void; requestAi?: (pos: number) => void; home?: boolean }>({
  name: "slashCommand",
  addOptions: () => ({ requestImage: () => {}, requestAi: undefined, home: false }),
  addProseMirrorPlugins() {
    const requestAi = this.options.requestAi;
    const items = slashItems(() => this.options.requestImage(), requestAi && ((pos) => requestAi(pos)), this.options.home);
    return [
      Suggestion<SlashItem>({
        editor: this.editor,
        char: "/",
        allowSpaces: false,
        startOfLine: false,
        // Only offer blocks at the top level or inside simple text blocks.
        allow: ({ state, range }) => {
          const $from = state.doc.resolve(range.from);
          return $from.parent.type.name === "paragraph";
        },
        items: ({ query }) => {
          const q = query.toLowerCase();
          return items.filter((item) => `${item.title} ${item.keywords}`.toLowerCase().includes(q)).slice(0, 20);
        },
        command: ({ editor, range, props }) => props.run(editor, range),
        render: () => {
          let renderer: ReactRenderer<MenuHandle, SuggestionProps<SlashItem>> | null = null;
          const place = (props: SuggestionProps<SlashItem>) => {
            const rect = props.clientRect?.();
            if (!renderer || !rect) return;
            const element = renderer.element;
            computePosition({ getBoundingClientRect: () => rect }, element, {
              placement: "bottom-start",
              strategy: "fixed",
              middleware: [offset(6), flip(), shift({ padding: 8 })],
            }).then(({ x, y }) => {
              Object.assign(element.style, { left: `${x}px`, top: `${y}px` });
            });
          };
          return {
            onStart: (props) => {
              renderer = new ReactRenderer(SlashMenu, { props, editor: props.editor });
              Object.assign(renderer.element.style, { position: "fixed", zIndex: "60", left: "0", top: "0" });
              document.body.appendChild(renderer.element);
              place(props);
            },
            onUpdate: (props) => {
              renderer?.updateProps(props);
              place(props);
            },
            onKeyDown: (props) => {
              if (props.event.key === "Escape") {
                renderer?.destroy();
                renderer?.element.remove();
                renderer = null;
                return true;
              }
              return renderer?.ref?.onKeyDown(props) ?? false;
            },
            onExit: () => {
              renderer?.destroy();
              renderer?.element.remove();
              renderer = null;
            },
          };
        },
      }),
    ];
  },
});
