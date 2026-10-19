"use client";

import { useEffect, useRef, useState } from "react";
import { ImageUp, X } from "lucide-react";

type MediaItem = { id: string; url: string; originalName: string };

export async function uploadImage(file: File): Promise<{ url: string; originalName: string }> {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch("/admin/api/media", { method: "POST", body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Gagal mengunggah gambar.");
  return data;
}

/** Pick an image: upload a new one or reuse one from the media library. */
export function ImageDialog({
  onSelect,
  onClose,
}: {
  onSelect: (image: { url: string; alt: string }) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/admin/api/media")
      .then((res) => (res.ok ? res.json() : []))
      .then(setItems)
      .catch(() => setItems([]));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function upload(file: File | undefined) {
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const image = await uploadImage(file);
      onSelect({ url: image.url, alt: file.name.replace(/\.[^.]+$/, "") });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Sisipkan gambar"
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-sm font-medium">Sisipkan gambar</h2>
          <button type="button" onClick={onClose} aria-label="Tutup" className="inline-flex size-7 items-center justify-center rounded-md hover:bg-fill">
            <X className="size-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-5">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              upload(e.dataTransfer.files[0]);
            }}
            disabled={uploading}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong px-4 py-8 text-sm text-fg-muted transition-colors hover:border-accent hover:text-fg disabled:opacity-60"
          >
            <ImageUp className="size-6" />
            {uploading ? "Mengunggah…" : "Klik atau seret gambar ke sini"}
            <span className="text-xs text-fg-subtle">PNG, JPG, GIF, WebP, atau AVIF · maks. 10 MB</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
            hidden
            onChange={(e) => upload(e.target.files?.[0])}
          />
          {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

          <h3 className="mt-6 mb-3 text-xs font-medium text-fg-subtle uppercase">Pustaka media</h3>
          {items === null ? (
            <p className="text-sm text-fg-subtle">Memuat…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-fg-subtle">Belum ada gambar.</p>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect({ url: item.url, alt: item.originalName.replace(/\.[^.]+$/, "") })}
                  className="group overflow-hidden rounded-lg border border-line text-left hover:border-accent"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.url} alt="" className="aspect-square w-full object-cover" loading="lazy" />
                  <span className="block truncate px-2 py-1 text-[11px] text-fg-subtle">{item.originalName}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
