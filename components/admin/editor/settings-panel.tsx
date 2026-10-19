"use client";

import { useState, useTransition } from "react";
import { ExternalLink, History, RotateCcw, Trash2, X } from "lucide-react";
import { deletePage, setFeatured, setNavSection, updateSlug } from "@/app/admin/_actions/pages";
import { formatDateTime } from "@/components/admin/format";
import { ImageDialog } from "@/components/admin/editor/image-dialog";
import type { PageSeo } from "@/lib/site-types";
import { Button, Select, StatusBadge, inputClass } from "@/components/admin/ui";

export type RevisionItem = {
  id: string;
  title: string;
  reason: string;
  createdAt: string;
  author: string | null;
};

const REASONS: Record<string, string> = {
  save: "Disimpan",
  publish: "Diterbitkan",
  schedule: "Dijadwalkan",
  restore: "Dipulihkan",
  import: "Diimpor",
  ai: "Dibuat dengan AI",
};

/** Navigation info for the editor (see navigationForEditor in lib/automation.ts). */
export type EditorNavigation = {
  /** "Tab › Section" the page is listed under, if any. */
  placement: string | null;
  sections: { id: string; label: string }[];
  /** Section the first publish adds the page to: an id, "none", or null (automatic). */
  navSection: string | null;
  /** Pengaturan → Otomatisasi → Navigasi otomatis. */
  auto: boolean;
};

export function SettingsPanel({
  pageId,
  isHome = false,
  slug,
  status,
  publishedAt,
  savedAt,
  revisions,
  onSlugChange,
  featured: initialFeatured,
  navigation,
  aiEnabled,
  seo,
  onSeoChange,
  title,
  description,
  onRestore,
  onClose,
}: {
  pageId: string;
  isHome?: boolean;
  slug: string;
  status: "draft" | "scheduled" | "published";
  publishedAt: string | null;
  savedAt: string;
  revisions: RevisionItem[];
  onSlugChange: (slug: string) => void;
  featured: boolean;
  navigation: EditorNavigation;
  aiEnabled: boolean;
  seo: PageSeo;
  onSeoChange: (seo: PageSeo) => void;
  title: string;
  description: string;
  onRestore: (revisionId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(slug);
  const [lastSlug, setLastSlug] = useState(slug);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [featured, setFeaturedState] = useState(initialFeatured);
  const [pending, startTransition] = useTransition();
  if (slug !== lastSlug) {
    // Keep the field in sync when the slug is set from elsewhere (e.g. from the title).
    setLastSlug(slug);
    setValue(slug);
  }

  function saveSlug() {
    setError("");
    setSaved(false);
    startTransition(async () => {
      const result = await updateSlug(pageId, value);
      if (!result.ok) setError(result.error);
      else {
        onSlugChange(result.slug);
        setSaved(true);
      }
    });
  }

  return (
    <aside className="fixed top-14 right-0 bottom-0 z-30 flex w-full max-w-sm flex-col border-l border-line bg-page shadow-xl">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 className="text-sm font-medium">Pengaturan halaman</h2>
        <button type="button" onClick={onClose} aria-label="Tutup" className="inline-flex size-7 items-center justify-center rounded-md hover:bg-fill">
          <X className="size-4" />
        </button>
      </div>

      <div className="flex-1 space-y-8 overflow-y-auto p-5">
        {isHome ? (
          <section className="text-sm text-fg-muted">
            Ini adalah beranda situs (<code>/</code>). Selama belum diterbitkan, situs memakai beranda bawaan.
          </section>
        ) : (
        <section>
          <label className="mb-1.5 block text-sm font-medium" htmlFor="page-slug">
            URL halaman
          </label>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-fg-subtle">/docs/</span>
            <input
              id="page-slug"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setSaved(false);
              }}
              className={`${inputClass} font-mono text-xs`}
            />
          </div>
          {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
          {saved && <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">URL disimpan.</p>}
          {status === "published" && value !== slug && (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              Halaman ini sudah terbit. Tautan lama tidak akan berfungsi lagi.
            </p>
          )}
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="secondary" onClick={saveSlug} disabled={pending || value === slug}>
              Simpan URL
            </Button>
            {status === "published" && (
              <a href={`/docs/${slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg">
                Buka <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        </section>
        )}

        <section className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-fg-muted">Status</span>
            <StatusBadge status={status} />
          </div>
          {status !== "draft" && (
            <div className="flex items-center justify-between">
              <span className="text-fg-muted">{status === "scheduled" ? "Terbit pada" : "Terbit sejak"}</span>
              <span>{formatDateTime(publishedAt)}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-fg-muted">Disimpan</span>
            <span>{formatDateTime(savedAt)}</span>
          </div>
        </section>

        {!isHome && (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={featured}
              onChange={(e) => {
                const next = e.target.checked;
                setFeaturedState(next);
                startTransition(async () => {
                  const result = await setFeatured(pageId, next);
                  if (!result.ok) {
                    setFeaturedState(!next);
                    setError(result.error);
                  }
                });
              }}
              className="mt-0.5 accent-accent"
            />
            <span>
              Halaman unggulan
              <span className="block text-xs text-fg-subtle">Tampil paling depan dengan label &ldquo;Unggulan&rdquo; di tampilan Ghost. Langsung berlaku.</span>
            </span>
          </label>
        )}

        {!isHome && <NavigationSection pageId={pageId} navigation={navigation} aiEnabled={aiEnabled} />}

        <SeoSection
          seo={seo}
          onChange={onSeoChange}
          title={title}
          description={description}
          url={isHome ? "/" : `/docs/${slug}`}
        />

        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
            <History className="size-4" />
            Riwayat revisi
          </h3>
          <p className="mb-3 text-xs text-fg-subtle">
            Revisi dibuat saat Anda menekan Ctrl+S, menerbitkan, atau memulihkan. Memulihkan hanya mengubah draf.
          </p>
          {revisions.length === 0 ? (
            <p className="text-sm text-fg-subtle">Belum ada revisi.</p>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {revisions.map((revision, i) => (
                <li key={revision.id} className="flex items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm">
                      {REASONS[revision.reason] ?? revision.reason}
                      {i === 0 && <span className="ml-1.5 text-xs text-fg-subtle">(terbaru)</span>}
                    </span>
                    <span className="block truncate text-xs text-fg-subtle">
                      {formatDateTime(revision.createdAt)}
                      {revision.author && ` · ${revision.author}`}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => confirm("Ganti isi draf dengan revisi ini?") && onRestore(revision.id)}
                    className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-fg-muted hover:bg-fill hover:text-fg"
                  >
                    <RotateCcw className="size-3" />
                    Pulihkan
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {!isHome && (
        <section className="border-t border-line pt-6">
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              if (!confirm("Hapus halaman ini beserta semua revisinya? Tindakan ini tidak bisa dibatalkan.")) return;
              startTransition(async () => {
                const result = await deletePage(pageId);
                if (result && !result.ok) setError(result.error);
              });
            }}
            disabled={pending}
          >
            <Trash2 className="size-3.5" />
            Hapus halaman
          </Button>
        </section>
        )}
      </div>
    </aside>
  );
}

/** Where the page shows up in the site navigation, or where its first publish will put it. */
function NavigationSection({ pageId, navigation, aiEnabled }: { pageId: string; navigation: EditorNavigation; aiEnabled: boolean }) {
  const [value, setValue] = useState(navigation.navSection ?? "");
  const [error, setError] = useState("");

  return (
    <section className="space-y-1.5">
      <h3 className="text-sm font-medium">Navigasi</h3>
      {navigation.placement ? (
        <p className="text-xs text-fg-muted">
          Tampil di <span className="font-medium text-fg">{navigation.placement}</span>. Urutan dan letaknya diatur di menu Navigasi.
        </p>
      ) : !navigation.auto ? (
        <p className="text-xs text-fg-muted">Belum ada di navigasi. Navigasi otomatis dimatikan, jadi tambahkan lewat menu Navigasi.</p>
      ) : navigation.sections.length === 0 ? (
        <p className="text-xs text-fg-muted">Navigasi belum punya bagian. Buat tab dan bagian di menu Navigasi dulu.</p>
      ) : (
        <>
          <label className="sr-only" htmlFor="nav-section">
            Bagian navigasi
          </label>
          <Select
            id="nav-section"
            value={value}
            onChange={async (e) => {
              const next = e.target.value;
              const previous = value;
              setValue(next);
              setError("");
              const result = await setNavSection(pageId, next || null);
              if (!result.ok) {
                setValue(previous);
                setError(result.error);
              }
            }}
            className="text-xs"
          >
            <option value="">Otomatis ({aiEnabled ? "dipilih AI" : "bagian pertama"})</option>
            {navigation.sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.label}
              </option>
            ))}
            <option value="none">Jangan tambahkan ke navigasi</option>
          </Select>
          <p className="text-xs text-fg-subtle">Halaman ditambahkan ke bagian ini saat pertama kali terbit.</p>
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        </>
      )}
    </section>
  );
}

function Counter({ value, ideal, max }: { value: number; ideal: [number, number]; max: number }) {
  const tone = value === 0 ? "text-fg-subtle" : value > max ? "text-red-600" : value < ideal[0] || value > ideal[1] ? "text-amber-600" : "text-emerald-600";
  return <span className={`text-[11px] ${tone}`}>{value} karakter (ideal {ideal[0]}–{ideal[1]})</span>;
}

/** Meta title/description, social image, and a search-result preview. */
function SeoSection({
  seo,
  onChange,
  title,
  description,
  url,
}: {
  seo: PageSeo;
  onChange: (seo: PageSeo) => void;
  title: string;
  description: string;
  url: string;
}) {
  const [picking, setPicking] = useState(false);
  const set = (patch: Partial<PageSeo>) => onChange({ ...seo, ...patch });
  const shownTitle = seo.title || title || "Tanpa judul";
  const shownDescription = seo.description || description || "Belum ada deskripsi.";

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium">SEO</h3>
      <div className="rounded-lg border border-line bg-surface p-3">
        <p className="truncate text-xs text-fg-subtle">{url}</p>
        <p className="truncate text-[15px] text-sky-700 dark:text-sky-400">{shownTitle}</p>
        <p className="line-clamp-2 text-xs text-fg-muted">{shownDescription}</p>
      </div>
      <label className="block">
        <span className="mb-1 flex items-center justify-between text-xs font-medium">
          Meta title <Counter value={(seo.title ?? "").length} ideal={[30, 60]} max={70} />
        </span>
        <input
          value={seo.title ?? ""}
          onChange={(e) => set({ title: e.target.value })}
          placeholder={title || "Pakai judul halaman"}
          className={`${inputClass} text-xs`}
        />
      </label>
      <label className="block">
        <span className="mb-1 flex items-center justify-between text-xs font-medium">
          Meta description <Counter value={(seo.description ?? "").length} ideal={[120, 160]} max={180} />
        </span>
        <textarea
          value={seo.description ?? ""}
          onChange={(e) => set({ description: e.target.value })}
          placeholder={description || "Pakai deskripsi halaman"}
          rows={3}
          className={`${inputClass} h-auto py-1.5 text-xs`}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium">Gambar pratinjau sosial (Open Graph)</span>
        <div className="flex gap-2">
          <input
            value={seo.image ?? ""}
            onChange={(e) => set({ image: e.target.value })}
            placeholder="/media/… atau https://…"
            className={`${inputClass} font-mono text-xs`}
          />
          <Button size="sm" variant="secondary" className="h-9" onClick={() => setPicking(true)}>
            Pilih
          </Button>
        </div>
        {seo.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={seo.image} alt="" className="mt-2 aspect-[1.91/1] w-full rounded-md border border-line object-cover" />
        )}
      </label>
      <label className="flex items-start gap-2 text-xs">
        <input
          type="checkbox"
          checked={Boolean(seo.noindex)}
          onChange={(e) => set({ noindex: e.target.checked })}
          className="mt-0.5 accent-accent"
        />
        <span>
          Sembunyikan dari mesin pencari (noindex)
          <span className="block text-fg-subtle">Halaman tetap bisa dibuka lewat tautan.</span>
        </span>
      </label>
      {picking && (
        <ImageDialog
          onClose={() => setPicking(false)}
          onSelect={({ url: image }) => {
            setPicking(false);
            set({ image });
          }}
        />
      )}
    </section>
  );
}
