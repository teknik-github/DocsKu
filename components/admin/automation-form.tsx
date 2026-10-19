"use client";

import { useState, useTransition } from "react";
import { Workflow } from "lucide-react";
import { saveAutomation } from "@/app/admin/_actions/site";
import { Alert, Button, Panel } from "@/components/admin/ui";
import type { AutomationSettings } from "@/lib/site-types";
import {
  COVER_PRESETS,
  DEFAULT_COVER_COLOR,
  HEX_COLOR,
  MIXED_COVER_COLOR,
  coverAccent,
  coverStyle,
  stableHash,
} from "@/lib/cover-palette";

type Switch = Exclude<keyof AutomationSettings, "coverColor">;

const OPTIONS: { key: Switch; label: string; description: string; ai?: boolean }[] = [
  {
    key: "navigation",
    label: "Navigasi otomatis",
    description: "Saat pertama terbit, halaman ditambahkan ke bagian navigasi yang dipilih di editor. Jika dibiarkan Otomatis, AI memilih bagian yang paling cocok (atau bagian pertama).",
  },
  { key: "slug", label: "Slug otomatis", description: "URL sementara (tanpa-judul…) diganti dengan URL dari judul saat terbit." },
  { key: "description", label: "Deskripsi otomatis", description: "Deskripsi halaman yang kosong ditulis AI dari isi halaman saat terbit.", ai: true },
  { key: "seo", label: "SEO otomatis", description: "Meta title dan meta description yang kosong ditulis AI saat terbit.", ai: true },
  { key: "cover", label: "Sampul otomatis", description: "Halaman tanpa gambar sampul memakai sampul buatan (gradasi dengan judul) di kartu dan pratinjau sosial." },
];

/** Pengaturan → Otomatisasi: what publishing does on its own. Nothing here publishes by itself. */
export function AutomationForm({ initial, aiReady }: { initial: AutomationSettings; aiReady: boolean }) {
  const [form, setForm] = useState(initial);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await saveAutomation(form);
      setMessage(result.ok ? { tone: "success", text: "Otomatisasi disimpan." } : { tone: "error", text: result.error });
    });
  }

  return (
    <Panel className="max-w-3xl space-y-5 p-5">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <Workflow className="size-4 text-accent" />
          Otomatisasi
        </h2>
        <p className="mt-1 text-xs text-fg-subtle">
          Dijalankan saat Anda menerbitkan atau menjadwalkan halaman. Menerbitkan tetap keputusan Anda: AI tidak pernah menerbitkan sendiri.
        </p>
      </div>

      <div className="space-y-3">
        {OPTIONS.map((option) => (
          <div key={option.key}>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={form[option.key]}
                onChange={(e) => setForm({ ...form, [option.key]: e.target.checked })}
                className="mt-0.5 accent-accent"
              />
              <span>
                {option.label}
                {option.ai && <span className="ml-1.5 rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent">AI</span>}
                <span className="block text-xs text-fg-subtle">{option.description}</span>
              </span>
            </label>
            {option.key === "cover" && form.cover && (
              <CoverColorPicker value={form.coverColor} onChange={(coverColor) => setForm({ ...form, coverColor })} />
            )}
          </div>
        ))}
      </div>

      {!aiReady && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          AI belum aktif, jadi langkah bertanda AI dilewati dan navigasi otomatis memakai bagian pertama.
        </p>
      )}
      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <Button variant="accent" onClick={save} disabled={pending}>
        {pending ? "Menyimpan…" : "Simpan"}
      </Button>
    </Panel>
  );
}

const SAMPLES = ["Pengenalan", "Mulai cepat", "Referensi API"];

/** Swatches for the generated cover colour, a custom colour, and a live preview. */
function CoverColorPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const custom = HEX_COLOR.test(value);
  const swatch = (active: boolean) =>
    `relative inline-flex size-8 items-center justify-center rounded-full ring-offset-2 ring-offset-surface transition ${active ? "ring-2 ring-fg" : "hover:ring-2 hover:ring-line-strong"}`;

  return (
    <div className="mt-3 ml-6 space-y-3">
      <div role="radiogroup" aria-label="Warna sampul" className="flex flex-wrap items-center gap-2.5">
        {COVER_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            role="radio"
            aria-checked={value === preset.id}
            aria-label={preset.label}
            title={preset.label}
            onClick={() => onChange(preset.id)}
            className={swatch(value === preset.id)}
            style={{ backgroundColor: preset.accent }}
          />
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={value === MIXED_COVER_COLOR}
          aria-label="Bervariasi"
          title="Bervariasi: warna berbeda per halaman"
          onClick={() => onChange(MIXED_COVER_COLOR)}
          className={swatch(value === MIXED_COVER_COLOR)}
          style={{ background: `conic-gradient(${COVER_PRESETS.map((p) => p.accent).join(", ")}, ${COVER_PRESETS[0].accent})` }}
        />
        <label className={`${swatch(custom)} cursor-pointer overflow-hidden border border-dashed border-line-strong`} title="Warna sendiri">
          <span className="sr-only">Warna sendiri</span>
          <input
            type="color"
            value={custom ? value : coverAccent(value, SAMPLES[0])}
            onChange={(e) => onChange(e.target.value)}
            onClick={(e) => {
              // Picking the current colour fires no change event, so choose it on open.
              if (!custom) onChange((e.target as HTMLInputElement).value);
            }}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
          <span className="pointer-events-none size-full" style={{ backgroundColor: custom ? value : "transparent" }} />
          {!custom && <span className="pointer-events-none absolute text-sm text-fg-muted">+</span>}
        </label>
        <span className="text-xs text-fg-muted">
          {custom
            ? `Warna sendiri ${value}`
            : value === MIXED_COVER_COLOR
              ? "Bervariasi per halaman"
              : (COVER_PRESETS.find((p) => p.id === value) ?? COVER_PRESETS.find((p) => p.id === DEFAULT_COVER_COLOR))?.label}
        </span>
      </div>
      <div className="grid max-w-md grid-cols-3 gap-2" aria-label="Pratinjau sampul">
        {SAMPLES.map((title) => {
          const colors = coverStyle(coverAccent(value, title), stableHash(title) % 360);
          return (
            <div
              key={title}
              className="flex aspect-[16/10] flex-col justify-between rounded-md border border-line p-2"
              style={{ backgroundColor: colors.page, backgroundImage: colors.background }}
            >
              <span className="size-2.5 rounded-[3px]" style={{ backgroundColor: colors.badge }} />
              <span>
                <span className="block text-[6px] tracking-wide uppercase" style={{ color: colors.label }}>
                  Bagian
                </span>
                <span className="block truncate text-[10px] leading-tight text-[#141413]">{title}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
