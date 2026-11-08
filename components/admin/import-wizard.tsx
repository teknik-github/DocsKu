"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, FileText, FolderTree, ImageIcon, Lock, Languages, UploadCloud, X } from "lucide-react";
import { Alert, Button, Input, Panel, Select } from "@/components/admin/ui";
import type { ImportItem, ImportPreview, ImportResult } from "@/lib/import";

type Choice = { include: boolean; title: string; slug: string };
type Mode = "auto" | "none" | `section:${string}`;

const MB = 1024 * 1024;
const formatSize = (bytes: number) => (bytes >= MB ? `${(bytes / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** Halaman → Impor: pick files, check the preview, create drafts. */
export function ImportWizard({
  sections,
  tabs,
  canCreateCategories,
}: {
  sections: { id: string; label: string }[];
  tabs: string[];
  canCreateCategories: boolean;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [mode, setMode] = useState<Mode>("auto");
  const [tab, setTab] = useState(tabs[0] ?? "Dokumentasi");
  const [result, setResult] = useState<ImportResult | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const total = files.reduce((sum, file) => sum + file.size, 0);
  const included = preview ? preview.items.filter((item) => choices[item.key]?.include) : [];

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    for (const file of Array.from(list)) if (!next.some((f) => f.name === file.name && f.size === file.size)) next.push(file);
    setFiles(next);
    setError(null);
  }

  async function read() {
    setBusy(true);
    setError(null);
    const form = new FormData();
    for (const file of files) form.append("files", file);
    try {
      const response = await fetch("/admin/api/import", { method: "POST", body: form });
      const data = (await response.json().catch(() => ({ error: "Server tidak menjawab dengan benar." }))) as ImportPreview | { error: string };
      if (!response.ok || "error" in data) {
        setError("error" in data ? data.error : "Berkas tidak bisa dibaca.");
        return;
      }
      setPreview(data);
      setChoices(Object.fromEntries(data.items.map((item) => [item.key, { include: true, title: item.title, slug: item.slug }])));
      setMode(data.items.some((item) => item.category) ? "auto" : "none");
    } catch {
      setError("Unggahan gagal. Periksa koneksi lalu coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    const category = mode === "auto" ? { mode: "auto" as const, tab } : mode === "none" ? { mode: "none" as const } : { mode: "section" as const, sectionId: mode.slice(8) };
    try {
      const response = await fetch(`/admin/api/import/${preview.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: preview.items.map((item) => ({ key: item.key, ...choices[item.key] })), category }),
      });
      const data = (await response.json().catch(() => ({ error: "Server tidak menjawab dengan benar." }))) as ImportResult | { error: string };
      if (!response.ok || "error" in data) {
        setError("error" in data ? data.error : "Impor gagal.");
        return;
      }
      setResult(data);
    } catch {
      setError("Impor gagal. Periksa koneksi lalu coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (preview && !result) await fetch(`/admin/api/import/${preview.id}`, { method: "DELETE" }).catch(() => undefined);
    setFiles([]);
    setPreview(null);
    setResult(null);
    setChoices({});
    setError(null);
  }

  const update = (key: string, patch: Partial<Choice>) => setChoices((current) => ({ ...current, [key]: { ...current[key], ...patch } }));

  if (result) {
    return (
      <div className="max-w-4xl space-y-5">
        <Alert tone="success">
          {result.created.length} halaman diimpor sebagai draf{result.images ? `, ${result.images} gambar masuk ke Media` : ""}
          {result.sections.length ? `, kategori baru: ${result.sections.join(", ")}` : ""}. Periksa lalu terbitkan dari editor.
        </Alert>
        <Panel className="divide-y divide-line">
          {result.created.map((page) => (
            <div key={page.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 p-4">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              <div className="min-w-0 flex-1">
                <Link href={`/admin/pages/${page.id}`} className="font-medium text-fg hover:text-accent">
                  {page.title}
                </Link>
                <p className="truncate font-mono text-xs text-fg-subtle">/docs/{page.slug}</p>
                {page.warnings.map((warning) => (
                  <p key={warning} className="text-xs text-amber-700 dark:text-amber-300">
                    {warning}
                  </p>
                ))}
              </div>
              <span className="text-xs text-fg-muted">{page.category ?? "Tanpa kategori"}</span>
            </div>
          ))}
        </Panel>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/pages?status=draft" className="inline-flex h-9 items-center rounded-lg bg-fg px-4 text-sm font-medium text-page hover:opacity-85">
            Ke daftar draf
          </Link>
          <Button variant="secondary" onClick={reset}>
            Impor lagi
          </Button>
        </div>
      </div>
    );
  }

  if (preview) {
    return (
      <div className="space-y-5">
        {error && <Alert>{error}</Alert>}
        <Panel className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <p className="text-sm font-medium text-fg">
              {preview.items.length} halaman ditemukan{preview.ownExport ? " · ekspor Docsku" : ""}
            </p>
            <p className="mt-1 text-xs text-fg-subtle">
              Semua masuk sebagai <strong>draf</strong>. Judul dan slug bisa diubah di bawah; slug yang sudah dipakai diberi akhiran angka.
            </p>
            {preview.skipped.length > 0 && (
              <details className="mt-2 text-xs text-fg-muted">
                <summary className="cursor-pointer">{preview.skipped.length} berkas dilewati</summary>
                <ul className="mt-1 list-disc pl-5">
                  {preview.skipped.slice(0, 50).map((name) => (
                    <li key={name} className="break-all">
                      {name}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
          <div className="space-y-2">
            <label className="block text-xs font-medium text-fg-muted" htmlFor="import-category">
              Kategori
            </label>
            <Select id="import-category" value={mode} onChange={(event) => setMode(event.target.value as Mode)}>
              <option value="auto">Ikuti folder / front-matter</option>
              <option value="none">Tanpa kategori</option>
              {sections.map((section) => (
                <option key={section.id} value={`section:${section.id}`}>
                  Semua ke: {section.label}
                </option>
              ))}
            </Select>
            {mode === "auto" && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                <label htmlFor="import-tab">Tab untuk folder:</label>
                <Input id="import-tab" value={tab} onChange={(event) => setTab(event.target.value)} list="import-tabs" className="h-8 w-48 text-xs" />
                <datalist id="import-tabs">
                  {tabs.map((title) => (
                    <option key={title} value={title} />
                  ))}
                </datalist>
                {!canCreateCategories && <span className="w-full text-amber-700 dark:text-amber-300">Hanya kategori yang sudah ada yang dipakai (membuat kategori baru khusus admin).</span>}
              </div>
            )}
          </div>
        </Panel>

        <Panel className="overflow-hidden">
          <div className="hidden grid-cols-[2rem_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.8fr)] gap-3 border-b border-line bg-fill/40 px-4 py-2 text-xs font-medium text-fg-muted md:grid">
            <input
              type="checkbox"
              aria-label="Pilih semua"
              className="size-4 accent-accent"
              checked={included.length === preview.items.length}
              onChange={(event) => setChoices((current) => Object.fromEntries(Object.entries(current).map(([key, value]) => [key, { ...value, include: event.target.checked }])))}
            />
            <span>Judul</span>
            <span>Slug</span>
            <span>Kategori</span>
          </div>
          <ul className="divide-y divide-line">
            {preview.items.map((item) => (
              <Row key={item.key} item={item} choice={choices[item.key]} mode={mode} tab={tab} sections={sections} onChange={(patch) => update(item.key, patch)} />
            ))}
          </ul>
        </Panel>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="accent" onClick={run} disabled={busy || included.length === 0}>
            {busy ? "Mengimpor…" : `Impor ${included.length} halaman`}
          </Button>
          <Button variant="ghost" onClick={reset} disabled={busy}>
            Batal
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-4">
      {error && <Alert>{error}</Alert>}
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          addFiles(event.dataTransfer.files);
        }}
        className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${dragging ? "border-accent bg-accent-soft" : "border-line bg-surface"}`}
      >
        <UploadCloud className="size-8 text-fg-subtle" />
        <div>
          <p className="text-sm font-medium text-fg">Tarik berkas ke sini</p>
          <p className="text-xs text-fg-subtle">.md, .mdx, atau .zip (beserta gambarnya) · maksimal 50 MB, 500 berkas</p>
        </div>
        <Button variant="secondary" onClick={() => input.current?.click()}>
          Pilih berkas
        </Button>
        <input
          ref={input}
          type="file"
          multiple
          accept=".md,.mdx,.markdown,.zip,image/png,image/jpeg,image/gif,image/webp,image/avif"
          className="sr-only"
          aria-label="Berkas untuk diimpor"
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      {files.length > 0 && (
        <Panel className="divide-y divide-line">
          {files.map((file) => (
            <div key={`${file.name}-${file.size}`} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              {/\.zip$/i.test(file.name) ? <FolderTree className="size-4 text-fg-subtle" /> : /\.(md|mdx|markdown)$/i.test(file.name) ? <FileText className="size-4 text-fg-subtle" /> : <ImageIcon className="size-4 text-fg-subtle" />}
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="text-xs text-fg-subtle tabular-nums">{formatSize(file.size)}</span>
              <button type="button" aria-label={`Hapus ${file.name}`} onClick={() => setFiles(files.filter((f) => f !== file))} className="rounded p-1 text-fg-subtle hover:bg-fill hover:text-fg">
                <X className="size-3.5" />
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-xs text-fg-subtle">
              {files.length} berkas · {formatSize(total)}
            </span>
            <Button variant="accent" onClick={read} disabled={busy || total > 50 * MB}>
              {busy ? "Membaca…" : "Baca berkas"}
            </Button>
          </div>
        </Panel>
      )}

      <div className="rounded-lg bg-fill/60 p-4 text-xs leading-relaxed text-fg-muted">
        <p className="font-medium text-fg">Yang dikenali</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          <li>Front-matter: title, description, slug, sidebar_position, serta kategori/bahasa dari ekspor Docsku.</li>
          <li>Tanpa front-matter, judul diambil dari heading # pertama atau nama berkas (id Notion dibuang).</li>
          <li>Gambar di dalam ZIP diunggah ke Media; tautan antar-berkas diarahkan ke halaman barunya.</li>
          <li>Folder teratas menjadi kategori bila Anda memilih “Ikuti folder”.</li>
        </ul>
      </div>
    </div>
  );
}

function Row({
  item,
  choice,
  mode,
  tab,
  sections,
  onChange,
}: {
  item: ImportItem;
  choice: Choice | undefined;
  mode: Mode;
  tab: string;
  sections: { id: string; label: string }[];
  onChange: (patch: Partial<Choice>) => void;
}) {
  if (!choice) return null;
  const isTranslation = Boolean(item.translationOf && item.locale);
  const category = isTranslation
    ? "Ikut halaman aslinya"
    : mode === "none"
      ? "—"
      : mode === "auto"
        ? item.category
          ? `${item.group ?? tab} › ${item.category}`
          : "—"
        : (sections.find((section) => `section:${section.id}` === mode)?.label ?? "—");
  return (
    <li className={`grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 gap-y-2 px-4 py-3 md:grid-cols-[2rem_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.8fr)] ${choice.include ? "" : "opacity-50"}`}>
      <input type="checkbox" aria-label={`Impor ${item.title}`} className="mt-2 size-4 accent-accent" checked={choice.include} onChange={(event) => onChange({ include: event.target.checked })} />
      <div className="min-w-0">
        <Input value={choice.title} onChange={(event) => onChange({ title: event.target.value })} aria-label="Judul" className="h-8 text-sm" />
        <p className="mt-1 truncate font-mono text-[11px] text-fg-subtle" title={item.path}>
          {item.path}
        </p>
        <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
          {item.visibility === "internal" && (
            <span className="inline-flex items-center gap-1 rounded bg-fill px-1.5 py-0.5 text-fg-muted">
              <Lock className="size-3" /> Internal
            </span>
          )}
          {isTranslation && (
            <span className="inline-flex items-center gap-1 rounded bg-fill px-1.5 py-0.5 text-fg-muted">
              <Languages className="size-3" /> {item.locale?.toUpperCase()}
            </span>
          )}
          {item.images > 0 && (
            <span className="inline-flex items-center gap-1 rounded bg-fill px-1.5 py-0.5 text-fg-muted">
              <ImageIcon className="size-3" /> {item.images}
            </span>
          )}
        </div>
        {item.warnings.map((warning) => (
          <p key={warning} className="mt-1 flex items-start gap-1 text-[11px] text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mt-px size-3 shrink-0" />
            {warning}
          </p>
        ))}
      </div>
      <div className="col-start-2 min-w-0 md:col-start-auto">
        <div className="flex items-center rounded-lg border border-line bg-surface pl-2 focus-within:border-accent">
          <span className="font-mono text-xs text-fg-subtle">/docs/</span>
          <input value={choice.slug} onChange={(event) => onChange({ slug: event.target.value })} aria-label="Slug" className="h-8 min-w-0 flex-1 bg-transparent pr-2 font-mono text-xs outline-none" />
        </div>
      </div>
      <p className="col-start-2 min-w-0 truncate text-xs text-fg-muted md:col-start-auto md:pt-2">{category}</p>
    </li>
  );
}
