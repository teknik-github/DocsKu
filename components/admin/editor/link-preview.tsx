"use client";

import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/core";
import { BubbleMenu } from "@tiptap/react/menus";
import { useEditorState } from "@tiptap/react";
import { AlertTriangle, ArrowRight, ExternalLink, FileText, Lock, Unlink } from "lucide-react";
import { lookupLinks, type LinkInfo } from "@/app/admin/_actions/links";

/**
 * Link preview in the editor: with the cursor in a link, what it points at
 * (a page's title and whether readers can open it, a redirect, a missing page,
 * or an external host). Also shown under the address field while typing a link.
 */

const cache = new Map<string, Promise<LinkInfo | undefined>>();

function load(href: string) {
  let entry = cache.get(href);
  if (!entry) {
    entry = lookupLinks([href]).then((result) => result[href]);
    cache.set(href, entry);
    // A page can be published or renamed meanwhile: forget after a minute.
    window.setTimeout(() => cache.delete(href), 60_000);
  }
  return entry;
}

export function useLinkInfo(href: string, delay = 0): LinkInfo | null | "loading" {
  const [state, setState] = useState<{ href: string; info: LinkInfo | null } | null>(null);
  useEffect(() => {
    const value = href.trim();
    if (!value) return;
    let live = true;
    const timer = window.setTimeout(() => {
      void load(value).then((info) => {
        if (live) setState({ href: value, info: info ?? null });
      });
    }, delay);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [href, delay]);
  if (!href.trim()) return null;
  return state?.href === href.trim() ? state.info : "loading";
}

const STATUS: Record<"draft" | "scheduled" | "published", string> = { draft: "Draf", scheduled: "Terjadwal", published: "Terbit" };

/** One line describing a link target; warnings in amber. */
export function LinkInfoLine({ href, delay = 0 }: { href: string; delay?: number }) {
  const info = useLinkInfo(href, delay);
  if (!info) return null;
  if (info === "loading") return <span className="text-[11px] text-fg-subtle">Memeriksa tautan…</span>;
  switch (info.kind) {
    case "page": {
      const warn = info.status !== "published" ? "Pembaca belum bisa membukanya." : info.visibility === "internal" ? "Hanya tim yang bisa membukanya." : null;
      return (
        <span data-testid="link-info" className="flex min-w-0 items-center gap-1.5 text-[11px]">
          {info.visibility === "internal" ? <Lock className="size-3 shrink-0 text-fg-subtle" /> : <FileText className="size-3 shrink-0 text-fg-subtle" />}
          <span className="truncate font-medium text-fg">{info.title}</span>
          {info.anchor && <span className="truncate text-fg-subtle">#{info.anchor}</span>}
          <span className={`shrink-0 rounded px-1 ${info.status === "published" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" : "bg-fill text-fg-muted"}`}>
            {info.visibility === "internal" ? "Internal" : STATUS[info.status]}
          </span>
          {warn && <span className="shrink-0 text-amber-700 dark:text-amber-400">{warn}</span>}
        </span>
      );
    }
    case "redirect":
      return (
        <span data-testid="link-info" className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
          <ArrowRight className="size-3 shrink-0" />
          Alamat lama, dialihkan ke <span className="font-mono">{info.to}</span>. Sebaiknya tautkan langsung.
        </span>
      );
    case "missing":
      return (
        <span data-testid="link-info" className="flex items-center gap-1.5 text-[11px] text-red-600 dark:text-red-400">
          <AlertTriangle className="size-3 shrink-0" />
          Halaman ini tidak ada.
        </span>
      );
    case "external":
      return (
        <span data-testid="link-info" className="flex items-center gap-1.5 text-[11px] text-fg-muted">
          <ExternalLink className="size-3 shrink-0" />
          Tautan luar ke <span className="font-medium">{info.host}</span>
        </span>
      );
    default:
      return null;
  }
}

/** Bubble shown when the cursor sits in a link (no selection): its target, open, remove. */
export function LinkPreviewMenu({ editor }: { editor: Editor }) {
  const href = useEditorState({ editor, selector: ({ editor: e }) => (e.isActive("link") ? ((e.getAttributes("link").href as string | undefined) ?? "") : "") });
  return (
    <BubbleMenu
      editor={editor}
      pluginKey="linkPreview"
      options={{ placement: "bottom-start", offset: 6 }}
      shouldShow={({ editor: e, state: s }) => s.selection.empty && e.isEditable && e.isActive("link")}
      className="flex max-w-[min(32rem,90vw)] items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 shadow-lg"
    >
      <span className="min-w-0 flex-1" data-testid="link-preview">
        <span className="block truncate font-mono text-[11px] text-fg-subtle">{href}</span>
        {href && <LinkInfoLine href={href} />}
      </span>
      {href && (
        <a href={href} target="_blank" rel="noreferrer" title="Buka di tab baru" className="inline-flex size-6 shrink-0 items-center justify-center rounded text-fg-muted hover:bg-fill hover:text-fg">
          <ExternalLink className="size-3.5" />
        </a>
      )}
      <button
        type="button"
        title="Hapus tautan"
        aria-label="Hapus tautan"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().extendMarkRange("link").unsetLink().run()}
        className="inline-flex size-6 shrink-0 items-center justify-center rounded text-fg-muted hover:bg-fill hover:text-fg"
      >
        <Unlink className="size-3.5" />
      </button>
    </BubbleMenu>
  );
}
