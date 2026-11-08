"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ExternalLink, Trash2 } from "lucide-react";
import { archiveVersion, deleteVersion, saveCurrentVersionLabel } from "@/app/admin/_actions/versions";
import type { VersionInfo } from "@/lib/versions";
import { Alert, Button, Field, Input, Panel, buttonClass } from "@/components/admin/ui";
import { confirmDialog } from "@/components/admin/dialog";
import { formatDateTime } from "@/components/admin/format";

export function VersionsManager({ versions, currentLabel }: { versions: VersionInfo[]; currentLabel: string }) {
  const router = useRouter();
  const [label, setLabel] = useState(currentLabel);
  const [form, setForm] = useState({ slug: "", label: "", note: "" });
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, start] = useTransition();

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    setMessage(null);
    start(async () => {
      const result = await action();
      if (!result.ok) return setMessage({ tone: "error", text: result.error ?? "Gagal." });
      setMessage({ tone: "success", text: success });
      router.refresh();
    });
  }

  async function remove(version: VersionInfo) {
    const ok = await confirmDialog({
      title: `Hapus versi ${version.label}?`,
      message: `Arsip ${version.pages} halaman di /docs/v/${version.slug} dihapus permanen. Tautan ke versi ini akan menjadi 404.`,
      confirmLabel: "Hapus versi",
      tone: "danger",
    });
    if (ok) run(() => deleteVersion(version.id), `Versi ${version.label} dihapus.`);
  }

  return (
    <div className="max-w-3xl space-y-6">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <Panel className="space-y-3 p-5">
        <h2 className="text-sm font-medium text-fg">Versi saat ini</h2>
        <p className="text-xs text-fg-subtle">Nama dokumentasi yang sedang tayang di pemilih versi, misalnya “v2.0” atau “Terbaru”.</p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-56">
            <Input value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} aria-label="Nama versi saat ini" />
          </div>
          <Button size="sm" onClick={() => run(() => saveCurrentVersionLabel(label), "Nama versi saat ini disimpan.")} disabled={pending || !label.trim() || label === currentLabel}>
            Simpan
          </Button>
        </div>
      </Panel>

      <Panel className="space-y-4 p-5" data-testid="archive-form">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-medium text-fg">
            <Archive className="size-4 text-accent" />
            Arsipkan dokumentasi saat ini
          </h2>
          <p className="mt-1 text-xs text-fg-subtle">
            Semua halaman publik yang sudah terbit dan navigasinya disalin apa adanya. Setelah itu Anda bebas mengubah dokumentasi untuk versi berikutnya; arsip tidak ikut berubah.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nama versi" hint="Tampil di pemilih versi.">
            <Input value={form.label} maxLength={40} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="v1.0" />
          </Field>
          <Field label="Alamat" hint={`/docs/v/${form.slug || "…"}`}>
            <Input value={form.slug} maxLength={31} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9.-]/g, "") })} placeholder="1.0" />
          </Field>
        </div>
        <Field label="Catatan (opsional)">
          <Input value={form.note} maxLength={300} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Versi sebelum migrasi ke API baru" />
        </Field>
        <Button
          variant="accent"
          size="sm"
          disabled={pending || !form.slug || !form.label.trim()}
          onClick={() =>
            run(async () => {
              const result = await archiveVersion(form);
              if (result.ok) setForm({ slug: "", label: "", note: "" });
              return result;
            }, `Dokumentasi diarsipkan sebagai ${form.label}.`)
          }
        >
          <Archive className="size-4" />
          Arsipkan sekarang
        </Button>
      </Panel>

      <Panel>
        <h2 className="border-b border-line px-5 py-3 text-sm font-medium text-fg">Versi arsip ({versions.length})</h2>
        {versions.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-fg-subtle">Belum ada versi arsip. Pemilih versi baru muncul di situs setelah ada arsip.</p>
        ) : (
          <ul className="divide-y divide-line">
            {versions.map((version) => (
              <li key={version.id} className="flex items-center gap-3 px-5 py-3" data-testid="version-row">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg">
                    {version.label} <span className="font-mono text-xs font-normal text-fg-subtle">/docs/v/{version.slug}</span>
                  </p>
                  <p className="text-xs text-fg-subtle">
                    {version.pages} halaman · {formatDateTime(version.createdAt)}
                    {version.note && ` · ${version.note}`}
                  </p>
                </div>
                <a href={`/docs/v/${version.slug}`} target="_blank" rel="noreferrer" className={buttonClass("ghost", "sm")} aria-label={`Lihat ${version.label}`}>
                  <ExternalLink className="size-3.5" />
                </a>
                <Button variant="ghost" size="sm" aria-label={`Hapus ${version.label}`} onClick={() => void remove(version)} disabled={pending}>
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
