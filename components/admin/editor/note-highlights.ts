import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * Highlights the text that open internal notes quote ("Periksa" → Catatan).
 * Decorations only: nothing is written into the document, so notes never reach
 * the saved content or the public site. The page editor sends the current
 * quotes with `setNoteHighlights`; edits move the highlights along, and a
 * click on one calls `onSelect` with the note's id.
 */

export type NoteQuote = { id: string; quote: string; body: string; active?: boolean };

type State = { decorations: DecorationSet };

export const noteHighlightKey = new PluginKey<State>("noteHighlights");

/** Where `quote` first appears inside one text block (quotes come from a selection, whitespace collapsed). */
export function findQuote(doc: PMNode, quote: string): { from: number; to: number } | null {
  const wanted = quote.replace(/\s+/g, " ").trim();
  if (wanted.length < 2) return null;
  let found: { from: number; to: number } | null = null;
  doc.descendants((node, pos) => {
    if (found) return false;
    if (!node.isTextblock) return true;
    // Text of the block with each character's document position (inline nodes count as one placeholder).
    let text = "";
    const positions: number[] = [];
    node.forEach((child, offset) => {
      if (child.isText) {
        const value = child.text ?? "";
        for (let i = 0; i < value.length; i++) positions.push(pos + 1 + offset + i);
        text += value;
      } else {
        positions.push(pos + 1 + offset);
        text += "￼";
      }
    });
    const normalised = text.replace(/\s/g, " ");
    // A quote that spanned several blocks: match its start within one block.
    const needle = normalised.includes(wanted) ? wanted : wanted.slice(0, Math.min(60, wanted.length));
    const index = normalised.indexOf(needle);
    if (index >= 0 && needle.length >= 2) found = { from: positions[index], to: positions[index + needle.length - 1] + 1 };
    return false;
  });
  return found;
}

function build(doc: PMNode, quotes: NoteQuote[]) {
  const decorations: Decoration[] = [];
  for (const note of quotes) {
    const range = findQuote(doc, note.quote);
    if (!range) continue;
    decorations.push(
      Decoration.inline(range.from, range.to, {
        class: note.active ? "note-highlight note-highlight-active" : "note-highlight",
        "data-note-id": note.id,
        title: note.body.slice(0, 200),
      }),
    );
  }
  return DecorationSet.create(doc, decorations);
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    noteHighlights: {
      setNoteHighlights: (quotes: NoteQuote[]) => ReturnType;
    };
  }
}

export const NoteHighlights = Extension.create<{ onSelect: (id: string) => void }>({
  name: "noteHighlights",

  addOptions() {
    return { onSelect: () => {} };
  },

  addCommands() {
    return {
      setNoteHighlights:
        (quotes) =>
        ({ tr, dispatch }) => {
          // Decorations only: keep it out of undo history and don't mark the page as edited.
          if (dispatch) dispatch(tr.setMeta(noteHighlightKey, quotes).setMeta("addToHistory", false).setMeta("noteHighlights", true));
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    return [
      new Plugin<State>({
        key: noteHighlightKey,
        state: {
          init: () => ({ decorations: DecorationSet.empty }),
          apply(tr, value) {
            const quotes = tr.getMeta(noteHighlightKey) as NoteQuote[] | undefined;
            if (quotes) return { decorations: build(tr.doc, quotes) };
            return tr.docChanged ? { decorations: value.decorations.map(tr.mapping, tr.doc) } : value;
          },
        },
        props: {
          decorations(state) {
            return noteHighlightKey.getState(state)?.decorations;
          },
          handleClick(_view, _pos, event) {
            const target = (event.target as HTMLElement | null)?.closest?.("[data-note-id]");
            const id = target?.getAttribute("data-note-id");
            if (id) options.onSelect(id);
            return false;
          },
        },
      }),
    ];
  },
});
