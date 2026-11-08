"use client";

import { useState } from "react";
import { Download, FileJson, Terminal } from "lucide-react";
import { Panel, buttonClass } from "@/components/admin/ui";

/** Pengaturan → Cadangan & ekspor: download links for the docs ZIP and the JSON export, plus the CLI backup. */
export function ExportPanel({ pages, drafts, internal, translations }: { pages: number; drafts: number; internal: number; translations: number }) {
  const [all, setAll] = useState(false);
  const [withInternal, setWithInternal] = useState(false);
  const [withTranslations, setWithTranslations] = useState(true);
  const [media, setMedia] = useState(true);
  const params = new URLSearchParams();
  if (all) params.set("status", "semua");
  if (withInternal) params.set("internal", "1");
  if (withTranslations) params.set("terjemahan", "1");
  if (media) params.set("media", "1");
  const href = `/admin/api/export${params.size ? `?${params}` : ""}`;

  const option = (label: string, hint: string, checked: boolean, set: (v: boolean) => void) => (
    <label className="flex cursor-pointer items-start gap-2.5 text-sm">
      <input type="checkbox" checked={checked} onChange={(event) => set(event.target.checked)} className="mt-0.5 size-4 accent-accent" />
      <span>
        <span className="text-fg">{label}</span>
        <span className="block text-xs text-fg-subtle">{hint}</span>
      </span>
    </label>
  );

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h2 className="text-base font-semibold text-fg">Cadangan & ekspor</h2>
        <p className="mt-0.5 text-sm text-fg-muted">Unduh dokumentasi sebagai berkas Markdown, atau cadangkan seluruh situs dari server.</p>
      </div>

      <Panel className="space-y-4 p-5">
        <div>
          <h3 className="text-sm font-medium text-fg">Ekspor dokumentasi (ZIP)</h3>
          <p className="mt-0.5 text-xs text-fg-subtle">
            Satu berkas .mdx per halaman dengan front-matter, satu folder per kategori, plus navigation.json. Bisa diimpor kembali lewat Halaman → Impor.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {option("Sertakan draf dan jadwal", `${drafts} halaman belum terbit (isi versi kerja).`, all, setAll)}
          {option("Sertakan artikel internal", `${internal} artikel hanya untuk tim.`, withInternal, setWithInternal)}
          {option("Sertakan terjemahan", `${translations} terjemahan, di folder _terjemahan/.`, withTranslations, setWithTranslations)}
          {option("Sertakan gambar", "Berkas dari Media yang dipakai halaman, di folder media/.", media, setMedia)}
        </div>
        <a href={href} download className={buttonClass("accent")}>
          <Download className="size-4" />
          Unduh ZIP ({pages} halaman terbit{all ? " + draf" : ""})
        </a>
      </Panel>

      <Panel className="flex flex-wrap items-center gap-4 p-5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-fill text-fg-muted">
          <FileJson className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium text-fg">Ekspor data lengkap (JSON)</h3>
          <p className="text-xs text-fg-subtle">
            Halaman (versi terbit dan kerja), navigasi, pengaturan, redirect, komentar, dan profil tim. Tanpa password, kunci AI, token, atau rahasia 2FA.
          </p>
        </div>
        <a href="/admin/api/export?jenis=json" download className={buttonClass("secondary")}>
          Unduh JSON
        </a>
      </Panel>

      <Panel className="space-y-2 p-5">
        <h3 className="flex items-center gap-2 text-sm font-medium text-fg">
          <Terminal className="size-4 text-fg-muted" />
          Cadangan penuh dari server
        </h3>
        <p className="text-xs text-fg-subtle">
          Basis data dan semua gambar dalam satu arsip, untuk pemulihan bila server rusak. Jalankan di folder aplikasi, lalu simpan arsipnya di tempat lain.
        </p>
        <pre className="overflow-x-auto rounded-lg bg-fill px-3 py-2 font-mono text-xs leading-relaxed text-fg">
          {`pnpm backup -- --prod            # → backups/docsku-prod-<tanggal>.tar.gz
pnpm restore -- <arsip> --prod --yes   # mengganti basis data dengan isi arsip`}
        </pre>
      </Panel>
    </div>
  );
}
