"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { Check, Copy, HelpCircle, LifeBuoy } from "lucide-react";
import { saveWidgetSettings } from "@/app/admin/_actions/widget";
import { Alert, Button, Field, Input, Panel, Textarea } from "@/components/admin/ui";
import { copyText } from "@/lib/copy-text";
import { normaliseOrigin } from "@/lib/widget";
import type { WidgetSettings } from "@/lib/site-types";

/** Pengaturan → Widget bantuan: the embeddable help launcher for other sites and apps. */
export function WidgetSettingsForm({
  initial,
  siteUrl,
  themeAccent,
  askAiAvailable,
}: {
  initial: WidgetSettings;
  /** SITE_URL when set; otherwise the address the dashboard is open at. */
  siteUrl: string | null;
  themeAccent: string;
  askAiAvailable: boolean;
}) {
  const [form, setForm] = useState(initial);
  const [origins, setOrigins] = useState(initial.allowedOrigins.join("\n"));
  const [saved, setSaved] = useState(initial);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [pending, startTransition] = useTransition();

  const lines = origins.split("\n").map((line) => line.trim()).filter(Boolean);
  const invalid = lines.filter((line) => !normaliseOrigin(line));
  // Without SITE_URL, the address the dashboard is open at (after hydration, so server and client agree).
  const here = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );
  const base = siteUrl ?? here;
  const snippet = `<script src="${base}/widget.js" async></script>`;
  const accent = form.accent ?? themeAccent;

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await saveWidgetSettings({ ...form, allowedOrigins: lines });
      if (!result.ok) {
        setMessage({ tone: "error", text: result.error });
        return;
      }
      setForm(result.value);
      setSaved(result.value);
      setOrigins(result.value.allowedOrigins.join("\n"));
      setPreviewKey((key) => key + 1);
      setMessage({
        tone: "success",
        text: result.value.enabled && !result.value.allowedOrigins.length ? "Disimpan. Tambahkan alamat situs agar widget bisa dipasang di sana." : "Widget bantuan disimpan.",
      });
    });
  }

  async function copy() {
    if (await copyText(snippet)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <Panel className="max-w-3xl space-y-5 p-5">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <LifeBuoy className="size-4 text-accent" />
          Widget bantuan
        </h2>
        <p className="mt-1 text-xs text-fg-subtle">
          Tombol &quot;Bantuan&quot; untuk situs atau aplikasi Anda yang lain: pengguna bisa mencari artikel, membacanya, dan bertanya ke AI tanpa
          meninggalkan halaman. Hanya artikel publik yang tampil di sana.
        </p>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="mt-0.5 accent-accent" />
        <span>
          Aktifkan widget
          <span className="block text-xs text-fg-subtle">Saat mati, skrip tidak menampilkan apa pun dan /widget tidak bisa dibuka.</span>
        </span>
      </label>

      <div className={`space-y-5 ${form.enabled ? "" : "opacity-60"}`}>
        <Field
          label="Situs yang boleh memasang"
          hint="Satu alamat per baris, misalnya https://app.contoh.com. Pakai https://*.contoh.com untuk semua subdomain. Situs lain tidak bisa menampilkan widget."
        >
          <Textarea
            rows={3}
            value={origins}
            onChange={(e) => setOrigins(e.target.value)}
            placeholder={"https://app.contoh.com\nhttps://*.contoh.com"}
            className="font-mono text-xs"
          />
        </Field>
        {invalid.length > 0 && (
          <p className="-mt-3 text-xs text-red-600 dark:text-red-400">Belum valid: {invalid.join(", ")}. Gunakan https:// (http:// hanya untuk localhost), tanpa path.</p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Teks tombol">
            <Input value={form.label} maxLength={30} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          </Field>
          <div role="group" aria-labelledby="widget-position">
            <span id="widget-position" className="mb-1.5 block text-sm font-medium text-fg">
              Posisi
            </span>
            <div className="flex gap-2">
              {(["left", "right"] as const).map((position) => (
                <button
                  key={position}
                  type="button"
                  aria-pressed={form.position === position}
                  onClick={() => setForm({ ...form, position })}
                  className={`h-9 flex-1 rounded-lg border text-sm transition-colors ${
                    form.position === position ? "border-accent bg-accent-soft text-fg" : "border-line text-fg-muted hover:bg-fill"
                  }`}
                >
                  {position === "left" ? "Kiri bawah" : "Kanan bawah"}
                </button>
              ))}
            </div>
          </div>
          <Field label="Sapaan" hint="Kalimat pertama di dalam widget.">
            <Input value={form.greeting} maxLength={120} onChange={(e) => setForm({ ...form, greeting: e.target.value })} />
          </Field>
          <div role="group" aria-labelledby="widget-color">
            <span id="widget-color" className="mb-1.5 block text-sm font-medium text-fg">
              Warna tombol
            </span>
            <div className="flex h-9 items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.accent === null}
                  onChange={(e) => setForm({ ...form, accent: e.target.checked ? null : themeAccent })}
                  className="accent-accent"
                />
                Ikuti tema
              </label>
              <input
                type="color"
                aria-label="Warna tombol"
                value={accent}
                disabled={form.accent === null}
                onChange={(e) => setForm({ ...form, accent: e.target.value })}
                className="h-8 w-12 cursor-pointer rounded border border-line bg-transparent disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          </div>
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={form.ai} onChange={(e) => setForm({ ...form, ai: e.target.checked })} className="mt-0.5 accent-accent" />
          <span>
            Tampilkan Tanya AI di widget
            <span className="block text-xs text-fg-subtle">
              {askAiAvailable ? "Memakai kuota dan batas yang sama dengan Tanya AI di pencarian." : "Tanya AI sedang tidak tersedia (lihat bagian Tanya AI), jadi widget hanya menampilkan pencarian."}
            </span>
          </span>
        </label>

        <div>
          <p className="mb-1.5 text-xs font-medium text-fg-muted">Kode pemasangan</p>
          <div className="flex items-center gap-2 rounded-lg border border-line bg-fill/50 p-2 pl-3">
            <code className="min-w-0 flex-1 truncate font-mono text-xs text-fg">{snippet}</code>
            <button type="button" onClick={copy} className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-fg-muted hover:bg-fill hover:text-fg">
              {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
              {copied ? "Tersalin" : "Salin"}
            </button>
          </div>
          <p className="mt-1.5 text-xs text-fg-subtle">
            Tempel sebelum <code className="font-mono">&lt;/body&gt;</code>. Tombol bantuan kontekstual: beri elemen apa pun atribut{" "}
            <code className="font-mono">data-docsku-help=&quot;kata kunci&quot;</code> untuk membuka widget dengan pencarian itu, atau panggil{" "}
            <code className="font-mono">DocskuWidget.open(&quot;kata kunci&quot;)</code>.
          </p>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-fg-muted">Pratinjau</p>
          <div className="relative h-[34rem] overflow-hidden rounded-xl border border-line bg-[repeating-linear-gradient(45deg,var(--fill)_0_1px,transparent_1px_14px)]">
            {saved.enabled ? (
              <div
                className={`absolute bottom-[4.5rem] h-[26rem] w-[min(22rem,calc(100%-2rem))] overflow-hidden rounded-2xl border border-line bg-page shadow-xl ${form.position === "left" ? "left-4" : "right-4"}`}
              >
                <iframe key={previewKey} src="/widget" title="Pratinjau widget bantuan" className="size-full" />
              </div>
            ) : (
              <p className="absolute inset-x-6 top-1/2 -translate-y-1/2 text-center text-xs text-fg-subtle">
                Aktifkan dan simpan untuk melihat isi widget di sini.
              </p>
            )}
            <span
              className={`absolute bottom-4 flex h-11 items-center gap-2 rounded-full pr-4 pl-3 text-sm font-semibold text-white shadow-lg ${form.position === "left" ? "left-4" : "right-4"}`}
              style={{ background: accent }}
            >
              <HelpCircle className="size-5" />
              {form.label || "Bantuan"}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-fg-subtle">Tombol mengikuti perubahan yang belum disimpan; isi widget menampilkan versi yang sudah disimpan.</p>
        </div>
      </div>

      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <Button size="sm" onClick={save} disabled={pending || invalid.length > 0}>
        Simpan
      </Button>
    </Panel>
  );
}
