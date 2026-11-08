"use client";

import { useState, useTransition } from "react";
import { Languages, Plus, X } from "lucide-react";
import { saveLanguageSettings } from "@/app/admin/_actions/translations";
import { Alert, Button, Panel, inputClass } from "@/components/admin/ui";
import { LANGUAGE_SUGGESTIONS, type LanguageSettings } from "@/lib/i18n";

/**
 * Pengaturan → Bahasa: the language of the originals and the extra languages
 * pages can be translated into (/docs/<code>/…), plus what readers of an extra
 * language see for a page that has no translation yet.
 */
export function LanguageSettingsForm({ initial, translations }: { initial: LanguageSettings; translations: Record<string, number> }) {
  const [form, setForm] = useState(initial);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const small = `${inputClass} h-8 text-sm`;
  const used = new Set([form.defaultLocale, ...form.languages.map((l) => l.code)]);
  const suggestions = LANGUAGE_SUGGESTIONS.filter((l) => !used.has(l.code));

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await saveLanguageSettings(form);
      setMessage(result.ok ? { tone: "success", text: "Bahasa disimpan. Pemilih bahasa tampil di header situs." } : { tone: "error", text: result.error });
    });
  }

  const setLanguage = (i: number, patch: Partial<{ code: string; label: string }>) =>
    setForm({ ...form, languages: form.languages.map((l, j) => (j === i ? { ...l, ...patch } : l)) });

  return (
    <Panel className="max-w-3xl space-y-5 p-5">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <Languages className="size-4 text-accent" />
          Bahasa
        </h2>
        <p className="mt-1 text-xs text-fg-subtle">
          Halaman ditulis dalam bahasa utama. Untuk setiap bahasa tambahan, buat terjemahan dari panel Pengaturan di editor (salin atau terjemahkan dengan AI). Terjemahan tampil di
          /docs/<span className="font-mono">kode</span>/…, dengan navigasi, pencarian, dan Tanya AI sendiri.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)]">
        <label className="text-xs font-medium text-fg-muted sm:pt-2">Bahasa utama</label>
        <div className="flex flex-wrap gap-2">
          <input
            value={form.defaultLocale}
            onChange={(e) => setForm({ ...form, defaultLocale: e.target.value })}
            aria-label="Kode bahasa utama"
            className={`${small} w-20 font-mono`}
          />
          <input
            value={form.defaultLabel}
            onChange={(e) => setForm({ ...form, defaultLabel: e.target.value })}
            aria-label="Nama bahasa utama"
            className={`${small} min-w-40 flex-1`}
          />
        </div>

        <span className="text-xs font-medium text-fg-muted sm:pt-2">Bahasa tambahan</span>
        <div className="space-y-2">
          {form.languages.length === 0 && <p className="pt-1.5 text-sm text-fg-subtle">Belum ada. Situs hanya satu bahasa.</p>}
          {form.languages.map((language, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2" data-testid="language-row">
              <input
                value={language.code}
                onChange={(e) => setLanguage(i, { code: e.target.value })}
                aria-label="Kode bahasa"
                placeholder="en"
                className={`${small} w-20 font-mono`}
              />
              <input
                value={language.label}
                onChange={(e) => setLanguage(i, { label: e.target.value })}
                aria-label="Nama bahasa"
                placeholder="English"
                className={`${small} min-w-40 flex-1`}
              />
              <span className="w-24 text-xs text-fg-subtle tabular-nums">{translations[language.code] ?? 0} terjemahan</span>
              <button
                type="button"
                onClick={() => setForm({ ...form, languages: form.languages.filter((_, j) => j !== i) })}
                aria-label={`Hapus ${language.label || language.code || "bahasa"}`}
                className="inline-flex size-8 items-center justify-center rounded-md text-fg-subtle hover:bg-fill hover:text-fg"
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <Button size="sm" variant="secondary" onClick={() => setForm({ ...form, languages: [...form.languages, { code: "", label: "" }] })}>
              <Plus className="size-3.5" />
              Tambah bahasa
            </Button>
            {suggestions.slice(0, 6).map((suggestion) => (
              <button
                key={suggestion.code}
                type="button"
                onClick={() => setForm({ ...form, languages: [...form.languages, suggestion] })}
                className="rounded-full border border-line px-2.5 py-1 text-xs text-fg-muted hover:bg-fill hover:text-fg"
              >
                + {suggestion.label}
              </button>
            ))}
          </div>
          {form.languages.some((l) => (translations[l.code] ?? 0) > 0) && (
            <p className="text-xs text-fg-subtle">Menghapus bahasa menyembunyikan terjemahannya dari situs; halamannya tetap ada di Halaman.</p>
          )}
        </div>

        <span className="text-xs font-medium text-fg-muted sm:pt-1">Belum diterjemahkan</span>
        <div className="space-y-2 text-sm">
          {(
            [
              { value: "fallback", label: "Tampilkan versi bahasa utama", hint: "Navigasi bahasa lain tetap lengkap; halaman yang belum diterjemahkan dibuka dalam bahasa utama." },
              { value: "hide", label: "Sembunyikan", hint: "Navigasi dan pencarian bahasa lain hanya berisi halaman yang sudah diterjemahkan." },
            ] as const
          ).map((option) => (
            <label key={option.value} className="flex items-start gap-2">
              <input
                type="radio"
                name="missing"
                checked={form.missing === option.value}
                onChange={() => setForm({ ...form, missing: option.value })}
                className="mt-1 accent-accent"
              />
              <span>
                {option.label}
                <span className="block text-xs text-fg-subtle">{option.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <Button size="sm" onClick={save} disabled={pending}>
        {pending ? "Menyimpan…" : "Simpan"}
      </Button>
    </Panel>
  );
}
