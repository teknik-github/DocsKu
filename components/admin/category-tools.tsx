"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, FolderPlus, ImagePlus, Pencil, Trash2, X } from "lucide-react";
import { createCategory, deleteCategory, renameCategory, setCategoryImage } from "@/app/admin/_actions/categories";
import { ImageDialog } from "@/components/admin/editor/image-dialog";
import { Icon } from "@/components/icon";
import { Alert, Button, Field, Input, Select } from "@/components/admin/ui";
import type { CategoryGroup } from "@/lib/categories";
import { confirmDialog } from "@/components/admin/dialog";

const NEW_GROUP = "__new";

/** "+ Kategori": name plus an existing group (navigation tab) or a new one. Admins only. */
export function NewCategoryButton({ groups }: { groups: CategoryGroup[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [group, setGroup] = useState(groups[0]?.id ?? NEW_GROUP);
  const [groupTitle, setGroupTitle] = useState(groups.length ? "" : "Dokumentasi");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    startTransition(async () => {
      const result = await createCategory({ title, group: group === NEW_GROUP ? { title: groupTitle } : { id: group } });
      if (!result.ok) return setError(result.error);
      setOpen(false);
      setTitle("");
      router.push(`/admin/pages?kategori=${result.id}`);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button variant="secondary" size="sm" className="w-full" onClick={() => setOpen(true)}>
        <FolderPlus className="size-3.5" />
        Kategori baru
      </Button>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-line bg-page p-3">
      <Field label="Nama kategori">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="mis. Instalasi" required autoFocus maxLength={80} />
      </Field>
      <Field label="Grup" hint="Grup tampil sebagai tab di header situs.">
        <Select value={group} onChange={(e) => setGroup(e.target.value)}>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title}
            </option>
          ))}
          <option value={NEW_GROUP}>+ Grup baru…</option>
        </Select>
      </Field>
      {group === NEW_GROUP && (
        <Field label="Nama grup baru">
          <Input value={groupTitle} onChange={(e) => setGroupTitle(e.target.value)} placeholder="mis. Panduan" required maxLength={80} />
        </Field>
      )}
      {error && <Alert>{error}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" variant="accent" size="sm" disabled={pending}>
          {pending ? "Menyimpan…" : "Tambah"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Batal
        </Button>
      </div>
    </form>
  );
}

/** Rename and delete for the open category. Admins only. */
export function CategoryActions({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function rename(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    startTransition(async () => {
      const result = await renameCategory(id, value);
      if (!result.ok) return setError(result.error);
      setEditing(false);
      router.refresh();
    });
  }

  async function remove() {
    const ok = await confirmDialog({
      title: `Hapus kategori “${title}”?`,
      message: "Hanya kategori yang kosong yang bisa dihapus. Grup yang ikut kosong juga dihapus.",
      confirmLabel: "Hapus kategori",
      tone: "danger",
    });
    if (!ok) return;
    setError("");
    startTransition(async () => {
      const result = await deleteCategory(id);
      if (!result.ok) return setError(result.error);
      router.push("/admin/pages");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {editing ? (
        <form onSubmit={rename} className="flex items-center gap-1.5">
          <Input value={value} onChange={(e) => setValue(e.target.value)} className="h-8 w-48" autoFocus maxLength={80} aria-label="Nama kategori" />
          <Button type="submit" size="sm" variant="secondary" disabled={pending} aria-label="Simpan nama">
            <Check className="size-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => (setEditing(false), setValue(title))} aria-label="Batal">
            <X className="size-3.5" />
          </Button>
        </form>
      ) : (
        <div className="flex gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" />
            Ganti nama
          </Button>
          <Button size="sm" variant="ghost" onClick={remove} disabled={pending}>
            <Trash2 className="size-3.5" />
            Hapus
          </Button>
        </div>
      )}
      {error && <p className="max-w-xs text-right text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

/**
 * The category's picture: its image, or the automatic icon. Admins can upload or pick one
 * from Media; it also replaces the icon on the help-centre home.
 */
export function CategoryImage({ id, image, icon, editable }: { id: string; image?: string; icon: string; editable: boolean }) {
  const router = useRouter();
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function save(url: string | null) {
    setError("");
    setPicking(false);
    startTransition(async () => {
      const result = await setCategoryImage(id, url);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  const tile = image ? (
    // eslint-disable-next-line @next/next/no-img-element -- uploads are served as-is from /media
    <img src={image} alt="" className="size-full object-contain" />
  ) : (
    <Icon name={icon} className="size-6" />
  );

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="group relative">
        <span className={`flex size-16 items-center justify-center overflow-hidden rounded-2xl ${image ? "border border-line bg-surface" : "bg-accent-soft text-accent"} ${pending ? "opacity-50" : ""}`}>
          {tile}
        </span>
        {editable && (
          <button
            type="button"
            onClick={() => setPicking(true)}
            aria-label={image ? "Ganti gambar kategori" : "Tambah gambar kategori"}
            className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          >
            <ImagePlus className="size-5" />
          </button>
        )}
      </div>
      {editable && image && (
        <button type="button" onClick={() => save(null)} className="text-xs text-fg-subtle hover:text-fg" disabled={pending}>
          Hapus gambar
        </button>
      )}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {picking && <ImageDialog onSelect={({ url }) => save(url)} onClose={() => setPicking(false)} />}
    </div>
  );
}
