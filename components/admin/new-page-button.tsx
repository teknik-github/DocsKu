"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal, useFormStatus } from "react-dom";
import Link from "next/link";
import { FilePlus2, Loader2, X } from "lucide-react";
import { createPage } from "@/app/admin/_actions/pages";
import { getTemplateChoices } from "@/app/admin/_actions/templates";
import { buttonClass } from "@/components/admin/ui";
import { TemplateIcon } from "@/components/admin/template-icons";
import type { TemplateChoice } from "@/lib/templates";

const BLANK = "";

/** Choices are fetched once per tab and refreshed in the background on every open. */
let cached: TemplateChoice[] | null = null;

/**
 * "Halaman baru": opens a picker (blank page or a template) and then posts
 * `createPage` with `template` and, from a category, `category`.
 */
export function NewPageButton({
  category,
  className,
  title,
  ariaLabel,
  children,
}: {
  category?: string;
  className: string;
  title?: string;
  ariaLabel?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} title={title} aria-label={ariaLabel} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        {children}
      </button>
      {open && <TemplatePicker category={category} onClose={() => setOpen(false)} />}
    </>
  );
}

function TemplatePicker({ category, onClose }: { category?: string; onClose: () => void }) {
  const [templates, setTemplates] = useState<TemplateChoice[] | null>(cached);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(BLANK);
  const panel = useRef<HTMLDivElement>(null);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    let live = true;
    getTemplateChoices().then((result) => {
      if (!live) return;
      if (result.ok) {
        cached = result.templates;
        setTemplates(result.templates);
      } else setError(result.error);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previous?.focus();
    };
  }, [onClose]);

  const builtin = templates?.filter((t) => t.builtin) ?? [];
  const custom = templates?.filter((t) => !t.builtin) ?? [];
  const order = [BLANK, ...builtin.map((t) => t.id), ...custom.map((t) => t.id)];
  const current = templates?.find((t) => t.id === selected) ?? null;

  /** Arrow keys move through the options like a radio group; Enter creates. */
  function onOptionKey(event: React.KeyboardEvent) {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
    if (step) {
      event.preventDefault();
      const next = order[(order.indexOf(selected) + step + order.length) % order.length];
      setSelected(next);
      panel.current?.querySelector<HTMLElement>(`[data-template="${CSS.escape(next)}"]`)?.focus();
    } else if (event.key === "Enter") {
      event.preventDefault();
      form.current?.requestSubmit();
    }
  }

  const option = (id: string, name: string, description: string, icon: ReactNode) => (
    <button
      key={id || "blank"}
      type="button"
      role="radio"
      aria-checked={selected === id}
      tabIndex={selected === id ? 0 : -1}
      data-template={id}
      onClick={() => setSelected(id)}
      onDoubleClick={() => form.current?.requestSubmit()}
      onKeyDown={onOptionKey}
      className={`flex min-w-0 items-start gap-3 rounded-lg border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
        selected === id ? "border-accent bg-accent-soft" : "border-line hover:border-line-strong hover:bg-fill"
      }`}
    >
      <span className={`flex size-8 shrink-0 items-center justify-center rounded-md ${selected === id ? "bg-accent text-white" : "bg-fill text-fg-muted"}`}>{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-fg">{name}</span>
        <span className="line-clamp-2 text-xs text-fg-muted">{description}</span>
      </span>
    </button>
  );

  // Portal to <body> so no ancestor's stacking context (sidebar, panels) can cover it.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-picker-title"
        className="flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-xl sm:max-h-[85vh] sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id="template-picker-title" className="text-base font-semibold text-fg">
              Halaman baru
            </h2>
            <p className="text-xs text-fg-muted">Mulai dari halaman kosong atau dari templat. Semua isi templat bisa diubah.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup" className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-fill hover:text-fg">
            <X className="size-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="min-h-0 overflow-y-auto p-5" role="radiogroup" aria-label="Templat">
            <div className="grid gap-2 sm:grid-cols-2">
              {option(BLANK, "Halaman kosong", "Mulai dari nol, tanpa isi awal.", <FilePlus2 className="size-4" />)}
            </div>
            <h3 className="mt-5 mb-2 text-xs font-medium tracking-wide text-fg-subtle uppercase">Templat bawaan</h3>
            {templates === null && !error ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="h-[66px] animate-pulse rounded-lg bg-fill" />
                ))}
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">{builtin.map((t) => option(t.id, t.name, t.description, <TemplateIcon name={t.icon} />))}</div>
            )}
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            {custom.length > 0 && (
              <>
                <h3 className="mt-5 mb-2 text-xs font-medium tracking-wide text-fg-subtle uppercase">Templat tim</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {custom.map((t) => option(t.id, t.name, t.description || (t.createdBy ? `Disimpan oleh ${t.createdBy}` : "Templat tim"), <TemplateIcon name={t.icon} />))}
                </div>
              </>
            )}
          </div>

          <aside className="hidden min-h-0 overflow-y-auto border-l border-line bg-fill/40 p-5 lg:block" aria-live="polite">
            {current ? (
              <>
                <p className="text-xs font-medium text-accent">{current.builtin ? "Templat bawaan" : "Templat tim"}</p>
                <h3 className="mt-1 text-sm font-semibold text-fg">{current.name}</h3>
                {current.description && <p className="mt-1 text-xs text-fg-muted">{current.description}</p>}
                {current.outline.length > 0 && (
                  <>
                    <p className="mt-4 mb-2 text-xs font-medium text-fg-subtle">Isi halaman</p>
                    <ol className="space-y-1.5 border-l border-line pl-3">
                      {current.outline.map((heading, i) => (
                        <li key={i} className="text-xs text-fg-muted">
                          {heading}
                        </li>
                      ))}
                    </ol>
                  </>
                )}
              </>
            ) : (
              <>
                <h3 className="text-sm font-semibold text-fg">Halaman kosong</h3>
                <p className="mt-1 text-xs text-fg-muted">Editor terbuka tanpa isi. Ketik <kbd className="rounded border border-line px-1">/</kbd> untuk menyisipkan blok.</p>
              </>
            )}
          </aside>
        </div>

        <form ref={form} action={createPage} className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
          {category && <input type="hidden" name="category" value={category} />}
          <input type="hidden" name="template" value={selected} />
          <Link href="/admin/templates" onClick={onClose} className="text-xs text-fg-muted hover:text-fg">
            Kelola templat
          </Link>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={buttonClass("ghost")}>
              Batal
            </button>
            <CreateButton />
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

function CreateButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass("accent")}>
      {pending && <Loader2 className="size-4 animate-spin" />}
      {pending ? "Membuat…" : "Buat halaman"}
    </button>
  );
}
