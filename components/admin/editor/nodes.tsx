"use client";

import { mergeAttributes, Node, type JSONContent } from "@tiptap/core";
import CodeBlock from "@tiptap/extension-code-block";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { ChevronRight, Plus, Trash2 } from "lucide-react";
import { calloutVariants, type CalloutVariant } from "@/components/blocks/callout";
import { Icon, iconNames } from "@/components/icon";

/**
 * Custom blocks for the page editor. Each node mirrors a public component in
 * components/blocks and is rendered by lib/content/render.tsx; attribute names
 * here are the stored JSON format.
 */

const CALLOUT_LABELS: Record<CalloutVariant, string> = {
  note: "Catatan",
  info: "Info",
  tip: "Tip",
  check: "Berhasil",
  warning: "Peringatan",
  danger: "Bahaya",
};

export const CODE_LANGUAGES = [
  "text",
  "bash",
  "javascript",
  "typescript",
  "jsx",
  "tsx",
  "json",
  "python",
  "go",
  "java",
  "php",
  "ruby",
  "rust",
  "csharp",
  "sql",
  "yaml",
  "html",
  "css",
  "markdown",
  "mdx",
  "http",
  "diff",
];

const smallInput =
  "h-7 rounded-md border border-line bg-surface px-2 text-xs text-fg outline-none focus:border-accent";

/** Frame around a custom block: a label row with controls, then the editable body. */
function BlockFrame({
  label,
  controls,
  onDelete,
  className = "",
  children,
}: {
  label: string;
  controls?: React.ReactNode;
  onDelete: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <NodeViewWrapper className={`group/block relative my-4 rounded-xl border border-dashed border-line-strong ${className}`}>
      <div contentEditable={false} className="flex flex-wrap items-center gap-2 border-b border-dashed border-line px-3 py-1.5 select-none">
        <span className="text-[11px] font-medium tracking-wide text-fg-subtle uppercase">{label}</span>
        <div className="flex flex-1 flex-wrap items-center gap-2">{controls}</div>
        <button
          type="button"
          onClick={onDelete}
          title="Hapus blok"
          className="inline-flex size-6 items-center justify-center rounded text-fg-subtle opacity-60 hover:bg-fill hover:text-red-600 group-hover/block:opacity-100"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
      <div className="p-3">{children}</div>
    </NodeViewWrapper>
  );
}

function AddButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-6 items-center gap-1 rounded-md px-2 text-xs text-fg-muted hover:bg-fill hover:text-fg"
    >
      <Plus className="size-3" />
      {children}
    </button>
  );
}

/** Appends a child node at the end of a container node view. */
function appendChild(props: NodeViewProps, child: JSONContent) {
  const pos = props.getPos();
  if (typeof pos !== "number") return;
  props.editor.chain().focus().insertContentAt(pos + props.node.nodeSize - 1, child).run();
}

const paragraph = (text?: string): JSONContent =>
  text ? { type: "paragraph", content: [{ type: "text", text }] } : { type: "paragraph" };

// ---------- Callout ----------

function CalloutView(props: NodeViewProps) {
  const variant = (props.node.attrs.variant as CalloutVariant) ?? "note";
  const style = calloutVariants[variant] ?? calloutVariants.note;
  const VariantIcon = style.icon;
  return (
    <NodeViewWrapper className={`group/block my-4 flex gap-3 rounded-xl border px-4 py-3 ${style.className}`}>
      <div contentEditable={false} className="flex flex-col items-center gap-2 pt-0.5 select-none">
        <VariantIcon className={`size-4 ${style.iconClass}`} />
      </div>
      <div className="min-w-0 flex-1">
        <div contentEditable={false} className="mb-1 flex flex-wrap items-center gap-2 select-none">
          <select
            value={variant}
            onChange={(e) => props.updateAttributes({ variant: e.target.value })}
            className={`${smallInput} pr-6`}
            aria-label="Jenis callout"
          >
            {Object.entries(CALLOUT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <input
            value={props.node.attrs.title ?? ""}
            onChange={(e) => props.updateAttributes({ title: e.target.value || null })}
            placeholder="Judul (opsional)"
            className={`${smallInput} min-w-0 flex-1`}
          />
          <button
            type="button"
            onClick={props.deleteNode}
            title="Hapus callout"
            className="inline-flex size-6 items-center justify-center rounded text-fg-subtle opacity-60 hover:text-red-600 group-hover/block:opacity-100"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
        <NodeViewContent className="text-sm [&_p]:my-1" />
      </div>
    </NodeViewWrapper>
  );
}

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes: () => ({ variant: { default: "note" }, title: { default: null } }),
  parseHTML: () => [{ tag: 'div[data-type="callout"]' }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-type": "callout" }), 0],
  addNodeView: () => ReactNodeViewRenderer(CalloutView),
});

// ---------- Cards ----------

function CardGroupView(props: NodeViewProps) {
  const cols = props.node.attrs.cols ?? 2;
  const grid = { 1: "[&>div]:grid-cols-1", 2: "[&>div]:sm:grid-cols-2", 3: "[&>div]:sm:grid-cols-3", 4: "[&>div]:sm:grid-cols-4" }[cols as 1 | 2 | 3 | 4];
  return (
    <BlockFrame
      label="Kartu"
      onDelete={props.deleteNode}
      controls={
        <>
          <select
            value={cols}
            onChange={(e) => props.updateAttributes({ cols: Number(e.target.value) })}
            className={`${smallInput} pr-6`}
            aria-label="Jumlah kolom"
          >
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n} kolom
              </option>
            ))}
          </select>
          <AddButton onClick={() => appendChild(props, { type: "card", attrs: { title: "Kartu baru" } })}>Kartu</AddButton>
        </>
      }
    >
      <NodeViewContent className={`[&>div]:grid [&>div]:gap-3 ${grid}`} />
    </BlockFrame>
  );
}

export const CardGroup = Node.create({
  name: "cardGroup",
  group: "block",
  content: "card+",
  addAttributes: () => ({ cols: { default: 2 } }),
  parseHTML: () => [{ tag: 'div[data-type="card-group"]' }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-type": "card-group" }), 0],
  addNodeView: () => ReactNodeViewRenderer(CardGroupView),
});

function CardView(props: NodeViewProps) {
  const { title, icon, href, description } = props.node.attrs;
  const update = (attrs: Record<string, unknown>) => props.updateAttributes(attrs);
  return (
    <NodeViewWrapper
      className={`group/card relative rounded-xl border bg-surface p-3 ${props.selected ? "border-accent" : "border-line"}`}
    >
      <div contentEditable={false} className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-fill text-fg-muted">
            {icon ? <Icon name={icon} className="size-3.5" /> : <span className="text-[10px]">—</span>}
          </span>
          <select
            value={icon ?? ""}
            onChange={(e) => update({ icon: e.target.value || null })}
            className={`${smallInput} min-w-0 flex-1 pr-6`}
            aria-label="Ikon"
          >
            <option value="">Tanpa ikon</option>
            {iconNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={props.deleteNode}
            title="Hapus kartu"
            className="inline-flex size-6 items-center justify-center rounded text-fg-subtle opacity-60 hover:text-red-600 group-hover/card:opacity-100"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
        <input
          value={title ?? ""}
          onChange={(e) => update({ title: e.target.value })}
          placeholder="Judul kartu"
          className={`${smallInput} w-full text-sm font-medium`}
        />
        <textarea
          value={description ?? ""}
          onChange={(e) => update({ description: e.target.value })}
          placeholder="Deskripsi singkat"
          rows={2}
          className={`${smallInput} h-auto w-full resize-none py-1`}
        />
        <input
          value={href ?? ""}
          onChange={(e) => update({ href: e.target.value || null })}
          placeholder="Tautan, mis. /docs/pengenalan"
          className={`${smallInput} w-full font-mono`}
        />
      </div>
    </NodeViewWrapper>
  );
}

export const Card = Node.create({
  name: "card",
  atom: true,
  selectable: true,
  addAttributes: () => ({
    title: { default: "" },
    icon: { default: null },
    href: { default: null },
    description: { default: "" },
  }),
  parseHTML: () => [{ tag: 'div[data-type="card"]' }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-type": "card" })],
  addNodeView: () => ReactNodeViewRenderer(CardView),
});

// ---------- Steps ----------

function StepsView(props: NodeViewProps) {
  return (
    <BlockFrame
      label="Langkah"
      onDelete={props.deleteNode}
      controls={
        <AddButton onClick={() => appendChild(props, { type: "step", attrs: { title: "" }, content: [paragraph()] })}>
          Langkah
        </AddButton>
      }
    >
      <NodeViewContent className="[counter-reset:step]" />
    </BlockFrame>
  );
}

export const Steps = Node.create({
  name: "steps",
  group: "block",
  content: "step+",
  parseHTML: () => [{ tag: 'div[data-type="steps"]' }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-type": "steps" }), 0],
  addNodeView: () => ReactNodeViewRenderer(StepsView),
});

function StepView(props: NodeViewProps) {
  return (
    <NodeViewWrapper className="group/step relative pb-4 pl-9 [counter-increment:step] last:pb-0">
      <span
        contentEditable={false}
        className="absolute top-0 left-0 flex size-6 items-center justify-center rounded-full border border-line bg-surface text-[11px] font-medium text-fg-muted select-none before:content-[counter(step)]"
      />
      <div contentEditable={false} className="flex items-center gap-2">
        <input
          value={props.node.attrs.title ?? ""}
          onChange={(e) => props.updateAttributes({ title: e.target.value })}
          placeholder="Judul langkah"
          className={`${smallInput} min-w-0 flex-1 text-sm font-medium`}
        />
        <button
          type="button"
          onClick={props.deleteNode}
          title="Hapus langkah"
          className="inline-flex size-6 items-center justify-center rounded text-fg-subtle opacity-60 hover:text-red-600 group-hover/step:opacity-100"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
      <NodeViewContent className="mt-1" />
    </NodeViewWrapper>
  );
}

export const Step = Node.create({
  name: "step",
  content: "block+",
  defining: true,
  addAttributes: () => ({ title: { default: "" } }),
  parseHTML: () => [{ tag: 'div[data-type="step"]' }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-type": "step" }), 0],
  addNodeView: () => ReactNodeViewRenderer(StepView),
});

// ---------- Tabs ----------

function TabsView(props: NodeViewProps) {
  return (
    <BlockFrame
      label="Tab"
      onDelete={props.deleteNode}
      controls={
        <AddButton onClick={() => appendChild(props, { type: "tab", attrs: { title: "Tab baru" }, content: [paragraph()] })}>
          Tab
        </AddButton>
      }
    >
      <NodeViewContent className="[&>div]:space-y-3" />
    </BlockFrame>
  );
}

export const Tabs = Node.create({
  name: "tabs",
  group: "block",
  content: "tab+",
  parseHTML: () => [{ tag: 'div[data-type="tabs"]' }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-type": "tabs" }), 0],
  addNodeView: () => ReactNodeViewRenderer(TabsView),
});

function TabView(props: NodeViewProps) {
  return (
    <NodeViewWrapper className="group/tab rounded-lg border border-line bg-surface/60 p-2.5">
      <div contentEditable={false} className="flex items-center gap-2">
        <span className="text-[11px] text-fg-subtle">Tab</span>
        <input
          value={props.node.attrs.title ?? ""}
          onChange={(e) => props.updateAttributes({ title: e.target.value })}
          placeholder="Nama tab"
          className={`${smallInput} min-w-0 flex-1 font-medium`}
        />
        <button
          type="button"
          onClick={props.deleteNode}
          title="Hapus tab"
          className="inline-flex size-6 items-center justify-center rounded text-fg-subtle opacity-60 hover:text-red-600 group-hover/tab:opacity-100"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
      <NodeViewContent className="mt-1" />
    </NodeViewWrapper>
  );
}

export const Tab = Node.create({
  name: "tab",
  content: "block+",
  defining: true,
  addAttributes: () => ({ title: { default: "" } }),
  parseHTML: () => [{ tag: 'div[data-type="tab"]' }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-type": "tab" }), 0],
  addNodeView: () => ReactNodeViewRenderer(TabView),
});

// ---------- Accordion ----------

function AccordionView(props: NodeViewProps) {
  return (
    <NodeViewWrapper className="group/block my-3 rounded-xl border border-line bg-surface">
      <div contentEditable={false} className="flex items-center gap-2 border-b border-line px-3 py-2">
        <ChevronRight className="size-4 text-fg-subtle" />
        <input
          value={props.node.attrs.title ?? ""}
          onChange={(e) => props.updateAttributes({ title: e.target.value })}
          placeholder="Pertanyaan atau judul"
          className="min-w-0 flex-1 bg-transparent text-sm font-medium text-fg outline-none placeholder:text-fg-subtle"
        />
        <button
          type="button"
          onClick={props.deleteNode}
          title="Hapus accordion"
          className="inline-flex size-6 items-center justify-center rounded text-fg-subtle opacity-60 hover:text-red-600 group-hover/block:opacity-100"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
      <NodeViewContent className="px-4 py-2 text-sm" />
    </NodeViewWrapper>
  );
}

export const Accordion = Node.create({
  name: "accordion",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes: () => ({ title: { default: "" } }),
  parseHTML: () => [{ tag: 'div[data-type="accordion"]' }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-type": "accordion" }), 0],
  addNodeView: () => ReactNodeViewRenderer(AccordionView),
});

// ---------- Code ----------

function CodeBlockView(props: NodeViewProps) {
  const { language, title, highlight, lineNumbers } = props.node.attrs;
  const languages = CODE_LANGUAGES.includes(language ?? "text") ? CODE_LANGUAGES : [language, ...CODE_LANGUAGES];
  return (
    <NodeViewWrapper className="group/code my-4 overflow-hidden rounded-xl border border-line bg-code">
      <div contentEditable={false} className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-1.5 select-none">
        <select
          value={language ?? "text"}
          onChange={(e) => props.updateAttributes({ language: e.target.value === "text" ? null : e.target.value })}
          className={`${smallInput} pr-6 font-mono`}
          aria-label="Bahasa"
        >
          {languages.map((lang) => (
            <option key={lang} value={lang}>
              {lang}
            </option>
          ))}
        </select>
        <input
          value={title ?? ""}
          onChange={(e) => props.updateAttributes({ title: e.target.value || null })}
          placeholder="Judul / nama file"
          className={`${smallInput} w-40 min-w-0 flex-1 font-mono`}
        />
        <input
          value={highlight ?? ""}
          onChange={(e) => props.updateAttributes({ highlight: e.target.value.replace(/[^\d,-]/g, "") || null })}
          placeholder="Sorot, mis. 2,4-5"
          title="Baris yang disorot"
          className={`${smallInput} w-32 font-mono`}
        />
        <label className="flex items-center gap-1 text-xs text-fg-muted">
          <input
            type="checkbox"
            checked={Boolean(lineNumbers)}
            onChange={(e) => props.updateAttributes({ lineNumbers: e.target.checked })}
            className="accent-accent"
          />
          No. baris
        </label>
        <button
          type="button"
          onClick={props.deleteNode}
          title="Hapus blok kode"
          className="ml-auto inline-flex size-6 items-center justify-center rounded text-fg-subtle opacity-60 hover:text-red-600 group-hover/code:opacity-100"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3 font-mono text-[13px] leading-relaxed">
        <NodeViewContent<"code"> as="code" />
      </pre>
    </NodeViewWrapper>
  );
}

export const CodeBlockNode = CodeBlock.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      title: { default: null },
      highlight: { default: null },
      lineNumbers: { default: false },
    };
  },
  addNodeView: () => ReactNodeViewRenderer(CodeBlockView),
}).configure({ enableTabIndentation: true, tabSize: 2 });

function CodeGroupView(props: NodeViewProps) {
  return (
    <BlockFrame
      label="Grup kode"
      onDelete={props.deleteNode}
      controls={
        <AddButton onClick={() => appendChild(props, { type: "codeBlock", attrs: { title: "Tab baru" } })}>Blok kode</AddButton>
      }
      className="[&_.group\/code]:my-2"
    >
      <p contentEditable={false} className="mb-1 text-xs text-fg-subtle select-none">
        Tiap blok kode menjadi satu tab. Label tab diambil dari judul blok.
      </p>
      <NodeViewContent />
    </BlockFrame>
  );
}

export const CodeGroup = Node.create({
  name: "codeGroup",
  group: "block",
  content: "codeBlock+",
  parseHTML: () => [{ tag: 'div[data-type="code-group"]' }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-type": "code-group" }), 0],
  addNodeView: () => ReactNodeViewRenderer(CodeGroupView),
});

/** Ready-made content for the "/" menu. */
export const templates = {
  callout: (): JSONContent => ({ type: "callout", attrs: { variant: "note" }, content: [paragraph()] }),
  cards: (): JSONContent => ({
    type: "cardGroup",
    attrs: { cols: 2 },
    content: [
      { type: "card", attrs: { title: "Kartu pertama", icon: "book" } },
      { type: "card", attrs: { title: "Kartu kedua", icon: "rocket" } },
    ],
  }),
  steps: (): JSONContent => ({
    type: "steps",
    content: [
      { type: "step", attrs: { title: "Langkah pertama" }, content: [paragraph()] },
      { type: "step", attrs: { title: "Langkah kedua" }, content: [paragraph()] },
    ],
  }),
  tabs: (): JSONContent => ({
    type: "tabs",
    content: [
      { type: "tab", attrs: { title: "Tab 1" }, content: [paragraph()] },
      { type: "tab", attrs: { title: "Tab 2" }, content: [paragraph()] },
    ],
  }),
  codeGroup: (): JSONContent => ({
    type: "codeGroup",
    content: [
      { type: "codeBlock", attrs: { language: "bash", title: "pnpm" } },
      { type: "codeBlock", attrs: { language: "bash", title: "npm" } },
    ],
  }),
  accordion: (): JSONContent => ({ type: "accordion", attrs: { title: "" }, content: [paragraph()] }),
  hero: (): JSONContent => ({
    type: "hero",
    attrs: { eyebrow: "", title: "Judul besar", subtitle: "", showSearch: true, buttons: [] },
  }),
};

// ---------- Hero (home page) ----------

type HeroButton = { title: string; href: string; icon?: string | null };

function HeroView(props: NodeViewProps) {
  const { eyebrow, title, subtitle, showSearch } = props.node.attrs;
  const buttons: HeroButton[] = props.node.attrs.buttons ?? [];
  const setButtons = (next: HeroButton[]) => props.updateAttributes({ buttons: next });
  const hasCode = props.node.childCount > 0;

  return (
    <NodeViewWrapper className="group/block relative my-4 rounded-2xl border border-dashed border-accent/50 bg-accent-soft/20">
      <div contentEditable={false} className="flex items-center gap-2 border-b border-dashed border-accent/40 px-4 py-1.5 select-none">
        <span className="text-[11px] font-medium tracking-wide text-accent uppercase">Hero</span>
        <button
          type="button"
          onClick={props.deleteNode}
          title="Hapus hero"
          className="ml-auto inline-flex size-6 items-center justify-center rounded text-fg-subtle opacity-60 hover:text-red-600 group-hover/block:opacity-100"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
      <div className="grid gap-6 p-4 lg:grid-cols-2">
        <div contentEditable={false} className="space-y-3">
          <input
            value={eyebrow ?? ""}
            onChange={(e) => props.updateAttributes({ eyebrow: e.target.value })}
            placeholder="Label kecil di atas judul"
            className={`${smallInput} w-full font-medium text-accent`}
          />
          <textarea
            value={title ?? ""}
            onChange={(e) => props.updateAttributes({ title: e.target.value })}
            placeholder="Judul besar (Enter untuk baris baru)"
            rows={2}
            className="w-full resize-none rounded-md border border-line bg-surface px-2 py-1 font-serif text-3xl leading-tight font-light text-fg outline-none focus:border-accent"
          />
          <textarea
            value={subtitle ?? ""}
            onChange={(e) => props.updateAttributes({ subtitle: e.target.value })}
            placeholder="Subjudul"
            rows={2}
            className="w-full resize-none rounded-md border border-line bg-surface px-2 py-1 text-sm text-fg-muted outline-none focus:border-accent"
          />
          <label className="flex items-center gap-2 text-xs text-fg-muted">
            <input
              type="checkbox"
              checked={showSearch !== false}
              onChange={(e) => props.updateAttributes({ showSearch: e.target.checked })}
              className="accent-accent"
            />
            Tampilkan kolom pencarian
          </label>
          <div className="space-y-1.5">
            <span className="text-[11px] font-medium text-fg-subtle uppercase">Tombol</span>
            {buttons.map((button, i) => (
              <div key={i} className="flex flex-wrap items-center gap-1.5">
                <select
                  value={button.icon ?? ""}
                  onChange={(e) => setButtons(buttons.map((b, j) => (j === i ? { ...b, icon: e.target.value || null } : b)))}
                  aria-label="Ikon tombol"
                  className={`${smallInput} w-24 pr-5`}
                >
                  <option value="">—</option>
                  {iconNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                <input
                  value={button.title}
                  onChange={(e) => setButtons(buttons.map((b, j) => (j === i ? { ...b, title: e.target.value } : b)))}
                  placeholder="Teks"
                  aria-label="Teks tombol"
                  className={`${smallInput} w-28 flex-1`}
                />
                <input
                  value={button.href}
                  onChange={(e) => setButtons(buttons.map((b, j) => (j === i ? { ...b, href: e.target.value } : b)))}
                  placeholder="/docs/…"
                  aria-label="Tautan tombol"
                  className={`${smallInput} w-32 flex-1 font-mono`}
                />
                <button
                  type="button"
                  onClick={() => setButtons(buttons.filter((_, j) => j !== i))}
                  aria-label="Hapus tombol"
                  className="inline-flex size-6 items-center justify-center rounded text-fg-subtle hover:text-red-600"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
            <AddButton onClick={() => setButtons([...buttons, { title: "Tombol", href: "/docs", icon: null }])}>Tombol</AddButton>
          </div>
        </div>
        <div className="min-w-0">
          {!hasCode && (
            <div contentEditable={false} className="flex h-full min-h-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line p-4 text-center text-xs text-fg-subtle">
              Sisi kanan kosong.
              <AddButton
                onClick={() => {
                  const pos = props.getPos();
                  if (typeof pos === "number") props.editor.chain().focus().insertContentAt(pos + 1, templates.codeGroup()).run();
                }}
              >
                Contoh kode
              </AddButton>
            </div>
          )}
          <NodeViewContent />
        </div>
      </div>
    </NodeViewWrapper>
  );
}

export const Hero = Node.create({
  name: "hero",
  group: "block",
  content: "codeGroup?",
  defining: true,
  isolating: true,
  addAttributes: () => ({
    eyebrow: { default: "" },
    title: { default: "" },
    subtitle: { default: "" },
    showSearch: { default: true },
    buttons: {
      default: [],
      parseHTML: (el) => {
        try {
          return JSON.parse(el.getAttribute("data-buttons") || "[]");
        } catch {
          return [];
        }
      },
      renderHTML: (attrs) => ({ "data-buttons": JSON.stringify(attrs.buttons ?? []) }),
    },
  }),
  parseHTML: () => [{ tag: 'section[data-type="hero"]' }],
  renderHTML: ({ HTMLAttributes }) => ["section", mergeAttributes(HTMLAttributes, { "data-type": "hero" }), 0],
  addNodeView: () => ReactNodeViewRenderer(HeroView),
});
