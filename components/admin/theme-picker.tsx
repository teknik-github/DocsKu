"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, ExternalLink } from "lucide-react";
import { saveTheme } from "@/app/admin/_actions/site";
import { Alert, Button, Panel } from "@/components/admin/ui";
import type { DocsLayout } from "@/lib/site-types";

/**
 * Themes for /docs. To add one: extend DocsLayout (lib/site-types.ts), the
 * enum in saveTheme, this list (with a sketch), and the branches in
 * app/(site)/docs/{layout,page}.tsx and [...slug]/page.tsx.
 */
const LAYOUTS: { id: DocsLayout; label: string; description: string }[] = [
  { id: "docs", label: "Dokumentasi", description: "Sidebar kiri dan daftar isi di kanan. Cocok untuk referensi yang dijelajahi." },
  { id: "hybrid", label: "Hibrida", description: "Hub kartu per bagian; artikel di tengah dengan breadcrumb dan menu bagian." },
  { id: "ghost", label: "Ghost (blog)", description: "Seperti demo.ghost.io: hero, filter, grid kartu dengan halaman unggulan." },
];

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
      <div className="grid gap-4 md:grid-cols-3">
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
          Tema Hibrida dan Ghost memakai gambar sampul halaman. Halaman tanpa sampul mendapat sampul otomatis.
        </span>
      </Panel>
    </div>
  );
}
