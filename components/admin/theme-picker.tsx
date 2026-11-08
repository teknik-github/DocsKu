"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Check, ExternalLink } from "lucide-react";
import { saveColorTheme, saveTheme } from "@/app/admin/_actions/site";
import { COLOR_THEMES, type ColorThemeId } from "@/lib/color-themes";
import { Alert, Button, Panel } from "@/components/admin/ui";
import { DOCS_LAYOUTS, type DocsLayout } from "@/lib/docs-layouts";

/** The /docs layouts; the list itself lives in lib/docs-layouts.ts (add a sketch below for a new one). */
const LAYOUTS = DOCS_LAYOUTS;

/** Tiny wireframe of each layout for the picker. */
function LayoutSketch({ layout }: { layout: DocsLayout }) {
  const bar = "rounded-sm bg-fg-subtle/30";
  return (
    <div className="flex h-20 flex-col gap-1 overflow-hidden rounded-lg border border-line bg-page p-1.5">
      <div className={`h-1.5 w-full ${bar}`} />
      {layout === "docs" && (
        <div className="flex flex-1 gap-1">
          <div className="w-1/5 space-y-1">
            {[0, 1, 2, 3].map((i) => <div key={i} className={`h-1 ${bar}`} />)}
          </div>
          <div className="flex-1 space-y-1 border-x border-line px-1">
            <div className="h-2 w-2/3 rounded-sm bg-fg/40" />
            {[0, 1, 2, 3].map((i) => <div key={i} className={`h-1 ${bar}`} />)}
          </div>
          <div className="w-1/6 space-y-1">
            {[0, 1, 2].map((i) => <div key={i} className={`h-1 ${bar}`} />)}
          </div>
        </div>
      )}
      {layout === "hybrid" && (
        <div className="flex-1 space-y-1">
          <div className="h-1 w-1/4 rounded-sm bg-accent/60" />
          <div className="grid grid-cols-3 gap-1">
            {[0, 1, 2].map((i) => <div key={i} className="h-5 rounded-sm bg-accent/25" />)}
          </div>
          <div className="h-1 w-1/4 rounded-sm bg-accent/60" />
          <div className="grid grid-cols-3 gap-1">
            {[0, 1, 2].map((i) => <div key={i} className="h-5 rounded-sm bg-accent/25" />)}
          </div>
        </div>
      )}
      {layout === "ghost" && (
        <div className="flex-1 space-y-1">
          <div className="h-5 rounded-sm bg-accent/40" />
          <div className="flex gap-0.5">
            {[0, 1, 2].map((i) => <div key={i} className={`h-1 w-3 rounded-full ${i === 0 ? "bg-fg/50" : bar}`} />)}
          </div>
          <div className="grid grid-cols-3 gap-1">
            {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-3.5 rounded-sm bg-accent/25" />)}
          </div>
        </div>
      )}
      {layout === "helpcenter" && (
        <div className="flex-1 space-y-1">
          <div className="flex h-6 items-center justify-center rounded-sm bg-accent">
            <div className="h-1.5 w-1/2 rounded-full bg-white/90" />
          </div>
          <div className="grid grid-cols-3 gap-1">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex h-4 items-start gap-0.5 rounded-sm border border-line p-0.5">
                <div className="size-1.5 rounded-[2px] bg-accent/60" />
                <div className={`h-1 flex-1 ${bar}`} />
              </div>
            ))}
          </div>
        </div>
      )}
      {layout === "book" && (
        <div className="flex flex-1 justify-center">
          <div className="w-3/5 space-y-1">
            <div className="mx-auto h-1.5 w-1/3 rounded-sm bg-accent/60" />
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-end gap-0.5">
                <div className={`h-1 ${i % 2 ? "w-1/3" : "w-1/2"} ${bar}`} />
                <div className="flex-1 border-b border-dotted border-fg-subtle/50" />
                <div className="h-1 w-1 rounded-sm bg-fg-subtle/40" />
              </div>
            ))}
            <div className="mt-1 h-3 rounded-sm border border-accent/50" />
          </div>
        </div>
      )}
      {layout === "minimal" && (
        <div className="flex flex-1 justify-center">
          <div className="w-1/2 space-y-1">
            <div className="flex gap-0.5">
              {[0, 1, 2].map((i) => <div key={i} className={`h-1.5 w-3 rounded-full ${i === 1 ? "bg-fg/50" : "border border-fg-subtle/40"}`} />)}
            </div>
            <div className="h-2 w-2/3 rounded-sm bg-fg/40" />
            {[0, 1, 2, 3, 4].map((i) => <div key={i} className={`h-1 ${bar}`} style={{ width: `${100 - i * 9}%` }} />)}
          </div>
        </div>
      )}
      {layout === "wiki" && (
        <div className="flex flex-1 gap-1">
          <div className="w-1/4 space-y-0.5">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => <div key={i} className={`h-0.5 ${i % 3 === 0 ? "bg-fg/40" : bar}`} style={{ marginLeft: i % 3 === 0 ? 0 : 3 }} />)}
          </div>
          <div className="flex-1 space-y-0.5">
            <div className="h-2 w-1/2 border-b border-line bg-fg/30" />
            {[0, 1, 2, 3, 4, 5, 6].map((i) => <div key={i} className={`h-0.5 ${bar}`} />)}
          </div>
          <div className="w-1/5 space-y-0.5">
            <div className="h-4 rounded-sm border border-line" />
            {[0, 1, 2].map((i) => <div key={i} className={`h-0.5 ${bar}`} />)}
          </div>
        </div>
      )}
      {layout === "magazine" && (
        <div className="flex-1 space-y-1">
          <div className="mx-auto h-1.5 w-1/2 border-y border-fg/50" />
          <div className="flex gap-1">
            <div className="h-7 flex-1 bg-accent/35" />
            <div className="w-1/4 space-y-1">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex gap-0.5">
                  <div className="h-1.5 w-1 bg-accent/60" />
                  <div className={`h-1 flex-1 ${bar}`} />
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-2.5 bg-accent/20" />)}
          </div>
        </div>
      )}
      {layout === "developer" && (
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex gap-1.5 border-b border-line pb-0.5">
            {[0, 1, 2].map((i) => <div key={i} className={`h-1 w-4 rounded-sm ${i === 0 ? "bg-accent" : bar}`} />)}
          </div>
          <div className="flex flex-1 gap-1">
            <div className="w-1/5 space-y-1">
              {[0, 1, 2, 3].map((i) => <div key={i} className={`h-1 ${bar}`} />)}
            </div>
            <div className="flex-1 space-y-1">
              <div className="h-1.5 w-1/2 rounded-sm bg-fg/40" />
              <div className={`h-1 ${bar}`} />
              <div className="h-3.5 rounded-sm bg-fg/70" />
              <div className={`h-1 w-4/5 ${bar}`} />
            </div>
            <div className="w-1/5 space-y-1">
              <div className="h-2.5 rounded-sm border border-line" />
              {[0, 1].map((i) => <div key={i} className={`h-1 ${bar}`} />)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


export function ThemePicker({ current }: { current: DocsLayout }) {
  const [active, setActive] = useState<DocsLayout>(current);
  const [selected, setSelected] = useState<DocsLayout>(current);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function apply() {
    setMessage(null);
    startTransition(async () => {
      const result = await saveTheme(selected);
      if (!result.ok) return setMessage({ tone: "error", text: result.error });
      setActive(selected);
      setMessage({ tone: "success", text: "Tema diterapkan dan langsung tampil di situs." });
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {LAYOUTS.map((option) => {
          const isSelected = selected === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setSelected(option.id)}
              aria-pressed={isSelected}
              className={`relative rounded-2xl border bg-surface p-4 text-left transition-colors ${
                isSelected ? "border-accent ring-2 ring-accent/20" : "border-line hover:border-line-strong"
              }`}
            >
              <LayoutSketch layout={option.id} />
              <span className="mt-4 flex items-center gap-2 text-sm font-medium">
                {option.label}
                {active === option.id && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                    <Check className="size-3" />
                    Aktif
                  </span>
                )}
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-fg-subtle">{option.description}</span>
            </button>
          );
        })}
      </div>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <Panel className="flex flex-wrap items-center gap-3 p-4">
        <Button variant="accent" onClick={apply} disabled={pending || selected === active}>
          {pending ? "Menerapkan…" : selected === active ? "Tema sedang dipakai" : "Terapkan tema"}
        </Button>
        <Link href="/docs" target="_blank" className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
          Lihat situs
          <ExternalLink className="size-3.5" />
        </Link>
        <span className="text-xs text-fg-subtle">
          Hibrida, Ghost, dan Majalah memakai gambar sampul halaman. Halaman tanpa sampul mendapat sampul otomatis.
        </span>
      </Panel>
    </div>
  );
}

type Swatch = { page: string; accent: string; soft: string };

/** One theme drawn with its own colours (not the page's), light half and dark half. */
function ThemePreview({ light, dark }: { light: Swatch; dark: Swatch }) {
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-line">
      {[
        { colors: light, text: "#141413" },
        { colors: dark, text: "#f5f4ee" },
      ].map(({ colors, text }, i) => (
        <div key={i} className="space-y-1.5 p-2.5" style={{ background: colors.page, color: text }}>
          <span className="block h-1.5 w-10 rounded-full opacity-30" style={{ background: text }} />
          <span className="inline-block rounded-md px-1.5 py-0.5 text-[10px] font-medium text-white" style={{ background: colors.accent }}>
            Tombol
          </span>
          <span className="flex items-center gap-1">
            <span className="rounded-full px-1.5 text-[9px]" style={{ background: colors.soft, color: colors.accent }}>
              Label
            </span>
            <span className="text-[10px] underline" style={{ color: colors.accent }}>
              Tautan
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Tema → Warna: colours for the public site and the dashboard. Clicking a theme
 * previews it on this page at once; it goes live for everyone after saving.
 */
export function ColorThemePicker({ current }: { current: ColorThemeId }) {
  const [active, setActive] = useState<ColorThemeId>(current);
  const [selected, setSelected] = useState<ColorThemeId>(current);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const saved = useRef(current);

  // Preview the selection on this page; leaving without saving brings the saved theme back.
  useEffect(() => {
    document.documentElement.dataset.color = selected;
  }, [selected]);
  useEffect(() => () => void (document.documentElement.dataset.color = saved.current), []);

  function apply() {
    setMessage(null);
    startTransition(async () => {
      const result = await saveColorTheme(selected);
      if (!result.ok) return setMessage({ tone: "error", text: result.error });
      saved.current = selected;
      setActive(selected);
      setMessage({ tone: "success", text: "Warna diterapkan ke situs dan dasbor." });
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {COLOR_THEMES.map((theme) => {
          const isSelected = selected === theme.id;
          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => {
                setMessage(null);
                setSelected(theme.id);
              }}
              aria-pressed={isSelected}
              className={`rounded-2xl border bg-surface p-3 text-left transition-colors ${
                isSelected ? "border-accent ring-2 ring-accent/20" : "border-line hover:border-line-strong"
              }`}
            >
              <ThemePreview light={theme.light} dark={theme.dark} />
              <span className="mt-3 flex items-center gap-2 text-sm font-medium">
                <span className="flex -space-x-1">
                  {[theme.light.accent, theme.light.soft, theme.dark.page].map((color, i) => (
                    <span key={i} className="size-3.5 rounded-full border border-surface" style={{ background: color }} />
                  ))}
                </span>
                {theme.name}
                {active === theme.id && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                    <Check className="size-3" />
                    Aktif
                  </span>
                )}
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-fg-subtle">{theme.description}</span>
            </button>
          );
        })}
      </div>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <Panel className="flex flex-wrap items-center gap-3 p-4">
        <Button variant="accent" onClick={apply} disabled={pending || selected === active}>
          {pending ? "Menerapkan…" : selected === active ? "Warna sedang dipakai" : "Terapkan warna"}
        </Button>
        {selected !== active && (
          <Button variant="ghost" onClick={() => setSelected(active)} disabled={pending}>
            Kembalikan
          </Button>
        )}
        <span className="text-xs text-fg-subtle">
          {selected !== active ? "Pratinjau: hanya halaman ini yang berubah sampai Anda menerapkannya." : "Berlaku untuk situs publik dan dasbor, mode terang dan gelap."}
        </span>
      </Panel>
    </div>
  );
}
