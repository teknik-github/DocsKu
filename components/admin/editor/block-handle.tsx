"use client";

import { useEffect, useRef, useState } from "react";
import { Extension, type Editor } from "@tiptap/core";
import { NodeSelection, Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { ArrowDown, ArrowUp, Copy, GripVertical, Trash2 } from "lucide-react";

/**
 * Drag handle for top-level blocks. A ProseMirror plugin reports which block
 * the pointer is over; <BlockHandle> renders the grip next to it. Dragging the
 * grip moves the block: dropping on the upper half of another block puts it
 * before that block, the lower half after it, with a line showing where.
 * Clicking the grip opens a menu (also the touch-friendly way to reorder).
 */

type Hover = { pos: number; top: number };
type BusEvent = { hover?: Hover | null; indicator?: number | null };

/** Block being dragged, per editor view. */
const dragging = new WeakMap<EditorView, number>();

/** Position of the top-level block containing `pos`, or null. */
function topLevelPos(view: EditorView, pos: number): number | null {
  const doc = view.state.doc;
  if (pos < 0 || pos > doc.content.size) return null;
  const $pos = doc.resolve(pos);
  if ($pos.depth >= 1) return $pos.before(1);
  const { node, offset } = doc.childAfter(pos);
  return node ? offset : null;
}

/** The top-level block at a vertical screen position, with its rectangle. */
function blockAt(view: EditorView, clientY: number) {
  const rect = view.dom.getBoundingClientRect();
  // Probe a little inside the left edge so margins between blocks still hit one.
  const hit = view.posAtCoords({ left: rect.left + 24, top: clientY });
  const pos = hit ? topLevelPos(view, hit.inside >= 0 ? hit.inside : hit.pos) : null;
  const dom = pos === null ? null : (view.nodeDOM(pos) as HTMLElement | null);
  if (pos === null || !dom?.getBoundingClientRect) return null;
  return { pos, rect: dom.getBoundingClientRect() };
}

/** Where a dragged block would land: before or after the block under the pointer. */
function dropTarget(view: EditorView, clientY: number) {
  const block = blockAt(view, clientY);
  if (!block) return null;
  const node = view.state.doc.nodeAt(block.pos);
  if (!node) return null;
  const before = clientY < block.rect.top + block.rect.height / 2;
  return { insertAt: before ? block.pos : block.pos + node.nodeSize, y: before ? block.rect.top : block.rect.bottom };
}

/** Moves the top-level block at `from` to the document position `insertAt` (between blocks). */
function moveBlockTo(view: EditorView, from: number, insertAt: number) {
  const node = view.state.doc.nodeAt(from);
  if (!node || insertAt === from || insertAt === from + node.nodeSize) return false;
  const tr = view.state.tr.delete(from, from + node.nodeSize);
  const target = tr.mapping.map(insertAt);
  tr.insert(target, node);
  const selection = node.isTextblock
    ? TextSelection.near(tr.doc.resolve(target + 1))
    : NodeSelection.create(tr.doc, target);
  view.dispatch(tr.setSelection(selection).scrollIntoView());
  view.focus();
  return true;
}

/** Moves the top-level block at `pos` one step up (-1) or down (+1). */
export function moveBlock(editor: Editor, pos: number, direction: -1 | 1): boolean {
  const { doc } = editor.state;
  const index = doc.resolve(pos).index(0);
  const sibling = index + direction;
  if (sibling < 0 || sibling >= doc.childCount) return false;
  const neighbour = doc.child(sibling);
  const node = doc.child(index);
  const insertAt = direction === -1 ? pos - neighbour.nodeSize : pos + node.nodeSize + neighbour.nodeSize;
  return moveBlockTo(editor.view, pos, insertAt);
}

function duplicateBlock(editor: Editor, pos: number) {
  const { state, view } = editor;
  const node = state.doc.nodeAt(pos);
  if (!node) return;
  view.dispatch(state.tr.insert(pos + node.nodeSize, node.copy(node.content)).scrollIntoView());
  view.focus();
}

function deleteBlock(editor: Editor, pos: number) {
  const node = editor.state.doc.nodeAt(pos);
  if (!node) return;
  if (editor.state.doc.childCount === 1) {
    editor.chain().focus().clearContent(true).run();
    return;
  }
  editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
}

/** Carries hover and drop-line updates from the plugin to <BlockHandle>, bypassing the editor's render. */
export function createHoverBus() {
  let listener: (event: BusEvent) => void = () => {};
  return {
    emit: (event: BusEvent) => listener(event),
    subscribe: (fn: (event: BusEvent) => void) => {
      listener = fn;
      return () => {
        listener = () => {};
      };
    },
  };
}
export type HoverBus = ReturnType<typeof createHoverBus>;

export const BlockHover = Extension.create<{ bus: HoverBus | null }>({
  name: "blockHover",
  addOptions: () => ({ bus: null }),

  addKeyboardShortcuts() {
    const move = (direction: -1 | 1) => () => {
      const pos = topLevelPos(this.editor.view, this.editor.state.selection.from);
      return pos === null ? false : moveBlock(this.editor, pos, direction);
    };
    return { "Alt-ArrowUp": move(-1), "Alt-ArrowDown": move(1) };
  },

  addProseMirrorPlugins() {
    const bus = this.options.bus;
    let last: Hover | null = null;
    // Only report changes; the handle re-renders, the editor does not.
    const hover = (next: Hover | null) => {
      if (next?.pos === last?.pos && next?.top === last?.top) return;
      last = next;
      bus?.emit({ hover: next });
    };
    const offsetTop = (view: EditorView) => view.dom.parentElement?.getBoundingClientRect().top ?? 0;

    return [
      new Plugin({
        key: new PluginKey("blockHover"),
        props: {
          handleDOMEvents: {
            mousemove: (view, event) => {
              if (!view.editable || dragging.has(view)) return false;
              const block = blockAt(view, event.clientY);
              if (block) hover({ pos: block.pos, top: block.rect.top - offsetTop(view) });
              return false;
            },
            dragover: (view, event) => {
              if (!dragging.has(view)) return false;
              event.preventDefault();
              const target = dropTarget(view, event.clientY);
              bus?.emit({ indicator: target ? target.y - offsetTop(view) : null });
              return true;
            },
            keydown: () => {
              hover(null);
              return false;
            },
          },
          handleDrop: (view, event) => {
            const from = dragging.get(view);
            if (from === undefined) return false;
            dragging.delete(view);
            bus?.emit({ indicator: null, hover: null });
            last = null;
            const target = dropTarget(view, event.clientY);
            if (target) moveBlockTo(view, from, target.insertAt);
            return true;
          },
        },
      }),
    ];
  },
});

function startBlockDrag(editor: Editor, pos: number, event: React.DragEvent) {
  const { view, state } = editor;
  const node = state.doc.nodeAt(pos);
  if (!node) return;
  dragging.set(view, pos);
  view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, pos)));
  document.body.classList.add("block-dragging");
  const dom = view.nodeDOM(pos) as HTMLElement | null;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", node.textContent);
  if (dom) event.dataTransfer.setDragImage(dom, 0, 0);
}

function endBlockDrag(editor: Editor, bus: HoverBus) {
  dragging.delete(editor.view);
  document.body.classList.remove("block-dragging");
  bus.emit({ indicator: null, hover: null });
}

export function BlockHandle({ editor, bus }: { editor: Editor; bus: HoverBus }) {
  const [hover, setHover] = useState<Hover | null>(null);
  const [indicator, setIndicator] = useState<number | null>(null);
  const [menu, setMenu] = useState<Hover | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const shown = menu ?? hover;

  useEffect(
    () =>
      bus.subscribe((event) => {
        if ("hover" in event) setHover(event.hover ?? null);
        if ("indicator" in event) setIndicator(event.indicator ?? null);
      }),
    [bus],
  );

  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  if (!editor.isEditable) return null;
  const node = shown ? editor.state.doc.nodeAt(shown.pos) : null;
  const index = shown && node ? editor.state.doc.resolve(shown.pos).index(0) : 0;
  const run = (fn: () => void) => {
    fn();
    setMenu(null);
    setHover(null);
  };
  const item = "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-fg hover:bg-fill disabled:opacity-40";

  return (
    <>
      {indicator !== null && (
        <div className="pointer-events-none absolute right-0 left-0 z-30 h-0.5 rounded-full bg-accent" style={{ top: indicator - 1 }} />
      )}
      {shown && node && (
        <div className="absolute -left-9 z-20" style={{ top: shown.top }}>
          <button
            type="button"
            draggable
            onDragStart={(event) => {
              startBlockDrag(editor, shown.pos, event);
              setMenu(null);
            }}
            onDragEnd={() => endBlockDrag(editor, bus)}
            onClick={() => setMenu(menu ? null : shown)}
            aria-label="Seret untuk memindah blok, klik untuk menu"
            title="Seret untuk memindah · klik untuk menu"
            className="flex h-6 w-5 cursor-grab items-center justify-center rounded text-fg-subtle hover:bg-fill hover:text-fg active:cursor-grabbing"
          >
            <GripVertical className="size-4" />
          </button>
          {menu && (
            <div ref={menuRef} className="absolute top-7 left-0 w-44 rounded-lg border border-line bg-surface p-1 shadow-lg">
              <button type="button" className={item} disabled={index === 0} onClick={() => run(() => moveBlock(editor, menu.pos, -1))}>
                <ArrowUp className="size-3.5" />
                Naikkan
                <kbd className="ml-auto text-[10px] text-fg-subtle">Alt+↑</kbd>
              </button>
              <button
                type="button"
                className={item}
                disabled={index === editor.state.doc.childCount - 1}
                onClick={() => run(() => moveBlock(editor, menu.pos, 1))}
              >
                <ArrowDown className="size-3.5" />
                Turunkan
                <kbd className="ml-auto text-[10px] text-fg-subtle">Alt+↓</kbd>
              </button>
              <button type="button" className={item} onClick={() => run(() => duplicateBlock(editor, menu.pos))}>
                <Copy className="size-3.5" />
                Duplikat
              </button>
              <button type="button" className={`${item} text-red-600 dark:text-red-400`} onClick={() => run(() => deleteBlock(editor, menu.pos))}>
                <Trash2 className="size-3.5" />
                Hapus
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
