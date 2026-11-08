"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { LayoutTemplate } from "lucide-react";
import { saveAsTemplate } from "@/app/admin/_actions/templates";
import { IconPicker } from "@/components/admin/template-list";
import { Alert, buttonClass, inputClass } from "@/components/admin/ui";

/** "Simpan sebagai templat" in the editor's page settings: saves the working copy (after flushing edits) as a team template. */
export function SaveTemplateSection({ pageId, title, onFlush }: { pageId: string; title: string; onFlush: () => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("file-text");
  const [includeTitle, setIncludeTitle] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    start(async () => {
      await onFlush();
      const result = await saveAsTemplate({ pageId, name, description, icon, includeTitle });
      if (!result.ok) return setError(result.error);
      setSaved(name);
      setOpen(false);
    });
  }

  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
        <LayoutTemplate className="size-4" />
        Templat
      </h3>
      <p className="mb-3 text-xs text-fg-subtle">Simpan isi halaman ini sebagai titik awal untuk halaman baru tim Anda.</p>
      {saved && !open && (
        <p className="mb-2 text-xs text-emerald-700 dark:text-emerald-400">
          Templat “{saved}” tersimpan.{" "}
          <Link href="/admin/templates" className="underline">
            Kelola templat
          </Link>
        </p>
      )}
      {open ? (
        <form onSubmit={submit} className="space-y-3 rounded-lg border border-line p-3">
          {error && <Alert>{error}</Alert>}
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-fg-muted">Nama templat</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required autoFocus className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-fg-muted">Deskripsi (opsional)</span>
            <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} placeholder="Kapan templat ini dipakai" className={inputClass} />
          </label>
          <div>
            <span className="mb-1 block text-xs font-medium text-fg-muted">Ikon</span>
            <IconPicker value={icon} onChange={setIcon} />
          </div>
          <label className="flex items-start gap-2 text-xs text-fg-muted">
            <input type="checkbox" checked={includeTitle} onChange={(e) => setIncludeTitle(e.target.checked)} className="mt-0.5 accent-accent" />
            Sertakan judul dan deskripsi halaman sebagai isi awal
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className={buttonClass("ghost", "sm")}>
              Batal
            </button>
            <button type="submit" disabled={pending} className={buttonClass("primary", "sm")}>
              {pending ? "Menyimpan…" : "Simpan templat"}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => {
            setName(title.trim().slice(0, 80));
            setSaved(null);
            setOpen(true);
          }}
          className={buttonClass("secondary", "sm")}
        >
          Simpan sebagai templat
        </button>
      )}
    </section>
  );
}
