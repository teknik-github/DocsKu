"use client";

import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { ChevronRight, ListTree } from "lucide-react";

/**
 * "Di halaman ini" while writing: the ## and ### headings of the working copy,
 * the same ones readers get in the published page's table of contents. Updates
 * as you type, marks the heading in view, and jumps to a heading on click.
 */

/** `end`: the position just inside the heading's end, where the cursor goes on click. */
type Item = { pos: number; end: number; level: 2 | 3; text: string };

/** Space taken by the editor's sticky toolbar when scrolling to a heading. */
const TOP_OFFSET = 96;

function headingsOf(editor: Editor): Item[] {
  const items: Item[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "heading") return;
    const level = node.attrs.level;
    if (level === 2 || level === 3) items.push({ pos, end: pos + node.nodeSize - 1, level, text: node.textContent.trim() });
    return false;
  });
  return items;
}

function useOutline(editor: Editor) {
  const [items, setItems] = useState<Item[]>(() => headingsOf(editor));
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    let frame = 0;
    // Recompute once per frame at most, however fast the transactions come.
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setItems(headingsOf(editor)));
    };
    editor.on("update", update);
    return () => {
      cancelAnimationFrame(frame);
      editor.off("update", update);
    };
  }, [editor]);

  // The active heading: the last one that has scrolled past the toolbar, or, at the very
  // bottom of the page (where later headings can't reach the top), the last one in view.
  useEffect(() => {
    function onScroll() {
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      let current: number | null = items[0]?.pos ?? null;
      for (const item of items) {
        const dom = editor.view.nodeDOM(item.pos);
        if (!(dom instanceof HTMLElement)) continue;
        const top = dom.getBoundingClientRect().top;
        if (top - TOP_OFFSET - 24 <= 0 || (atBottom && top < window.innerHeight)) current = item.pos;
      }
      setActive(current);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [editor, items]);

  function jump(item: Item) {
    setActive(item.pos);
    const dom = editor.view.nodeDOM(item.pos);
    if (dom instanceof HTMLElement) window.scrollTo({ top: dom.getBoundingClientRect().top + window.scrollY - TOP_OFFSET, behavior: "smooth" });
    // Put the cursor at the end of that heading, without the editor's own scrolling.
    editor
      .chain()
      .setTextSelection(item.end)
      .focus(undefined, { scrollIntoView: false })
      .run();
  }

  return { items, active, jump };
}

function List({ items, active, jump }: ReturnType<typeof useOutline>) {
  return (
    <ul className="space-y-0.5 border-l border-line">
      {items.map((item) => (
        <li key={item.pos}>
          <button
            type="button"
            onClick={() => jump(item)}
            className={`-ml-px block w-full border-l py-1 text-left text-sm transition-colors ${item.level === 3 ? "pl-6" : "pl-3"} ${
              item.pos === active ? "border-accent text-fg" : "border-transparent text-fg-subtle hover:text-fg"
            }`}
          >
            <span className="line-clamp-2">{item.text || <em className="text-fg-subtle">Judul kosong</em>}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Beside the editor on wide screens (`className` decides from which width). */
export function EditorOutline({ editor, className = "" }: { editor: Editor; className?: string }) {
  const outline = useOutline(editor);
  return (
    <nav aria-label="Di halaman ini" className={`fixed top-28 left-6 w-56 ${className}`}>
      <p className="mb-3 flex items-center gap-1.5 text-xs font-medium text-fg">
        <ListTree className="size-3.5 text-fg-subtle" />
        Di halaman ini
      </p>
      <div className="max-h-[calc(100vh-10rem)] overflow-y-auto pr-1">
        {outline.items.length ? (
          <List {...outline} />
        ) : (
          <p className="text-xs leading-relaxed text-fg-subtle">Belum ada judul. Ketik “## ” atau pilih Judul dari menu / agar muncul di sini.</p>
        )}
      </div>
    </nav>
  );
}

/** Collapsible version above the content, for screens without room at the side. */
export function InlineEditorOutline({ editor, className = "" }: { editor: Editor; className?: string }) {
  const outline = useOutline(editor);
  if (outline.items.length < 2) return null;
  return (
    <details className={`group mb-8 rounded-xl border border-line bg-surface px-4 py-3 text-sm ${className}`}>
      <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-fg [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 text-fg-subtle transition-transform group-open:rotate-90" />
        Di halaman ini
        <span className="font-normal text-fg-subtle">· {outline.items.length} judul</span>
      </summary>
      <div className="mt-3">
        <List {...outline} />
      </div>
    </details>
  );
}
