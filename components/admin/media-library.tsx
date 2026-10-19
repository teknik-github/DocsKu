"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ImageUp, Trash2 } from "lucide-react";
import { deleteMedia } from "@/app/admin/_actions/site";
import { uploadImage } from "@/components/admin/editor/image-dialog";
import { formatBytes, formatDateTime } from "@/components/admin/format";
import { Alert, Button, Panel } from "@/components/admin/ui";

type Item = {
  id: string;
  url: string;
  originalName: string;
  size: number;
  createdAt: string;
  uploadedBy: string | null;
};

export function MediaLibrary({ items }: { items: Item[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    setUploading(true);
    for (const file of files) {
      try {
        await uploadImage(file);
      } catch (e) {
        setError(`${file.name}: ${(e as Error).message}`);
      }
    }
    setUploading(false);
    router.refresh();
  }

  async function copy(item: Item) {
    await navigator.clipboard.writeText(new URL(item.url, window.location.origin).toString());
    setCopied(item.id);
    setTimeout(() => setCopied(null), 1500);
  }

  function remove(item: Item) {
    if (!confirm(`Hapus ${item.originalName}? Halaman yang memakainya akan menampilkan gambar rusak.`)) return;
    startTransition(async () => {
      const result = await deleteMedia(item.id);
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">{items.length} gambar</p>
        <Button variant="accent" onClick={() => fileRef.current?.click()} disabled={uploading}>
          <ImageUp className="size-4" />
          {uploading ? "Mengunggah…" : "Unggah gambar"}
        </Button>
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
          onChange={(e) => upload(e.target.files)}
        />
      </div>
      {error && <Alert>{error}</Alert>}

      {items.length === 0 ? (
        <Panel className="px-5 py-14 text-center text-sm text-fg-subtle">
          Belum ada gambar. Unggah dari sini atau langsung dari editor.
        </Panel>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => (
            <Panel key={item.id} className="group overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.url} alt={item.originalName} loading="lazy" className="aspect-[4/3] w-full bg-fill object-cover" />
              <div className="space-y-1 p-3">
                <p className="truncate text-sm text-fg" title={item.originalName}>
                  {item.originalName}
                </p>
                <p className="text-xs text-fg-subtle">
                  {formatBytes(item.size)} · {formatDateTime(item.createdAt)}
                </p>
                <div className="flex gap-1 pt-1">
                  <Button size="sm" variant="secondary" onClick={() => copy(item)}>
                    {copied === item.id ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                    {copied === item.id ? "Tersalin" : "Salin URL"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(item)} disabled={pending} aria-label="Hapus">
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
