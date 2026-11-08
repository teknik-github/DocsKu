"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { createPage } from "@/app/admin/_actions/pages";
import { deleteTemplate, updateTemplate } from "@/app/admin/_actions/templates";
import { confirmDialog } from "@/components/admin/dialog";
import { formatDateTime } from "@/components/admin/format";
import { TEMPLATE_ICONS, TemplateIcon } from "@/components/admin/template-icons";
import { Alert, buttonClass, inputClass } from "@/components/admin/ui";
import { TEMPLATE_ICON_NAMES } from "@/lib/template-icon-names";
import type { TemplateChoice } from "@/lib/templates";

/** Icon choice for a template, as a row of toggle buttons. */
export function IconPicker({ value, onChange }: { value: string; onChange: (icon: string) => void }) {
  return (
    <div role="radiogroup" aria-label="Ikon" className="flex flex-wrap gap-1.5">
      {TEMPLATE_ICON_NAMES.map((name) => {
        const Icon = TEMPLATE_ICONS[name];
        return (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={value === name}
            aria-label={name}
            title={name}
            onClick={() => onChange(name)}
            className={`flex size-8 items-center justify-center rounded-md border transition-colors ${
              value === name ? "border-accent bg-accent text-white" : "border-line text-fg-muted hover:bg-fill hover:text-fg"
            }`}
          >
            <Icon className="size-4" />
          </button>
        );
      })}
    </div>
  );
}

function UseButton({ id }: { id: string }) {
  return (
    <form action={createPage}>
      <input type="hidden" name="template" value={id} />
      <button type="submit" className={buttonClass("secondary", "sm")}>
        Pakai
      </button>
    </form>
  );
}

export function TemplateList({ templates, userId, admin }: { templates: TemplateChoice[]; userId: string; admin: boolean }) {
  const custom = templates.filter((t) => !t.builtin);
  const builtin = templates.filter((t) => t.builtin);
  return (
    <div className="space-y-10">
      <section>
        <h2 className="mb-1 text-sm font-semibold text-fg">Templat tim</h2>
        <p className="mb-4 text-xs text-fg-subtle">Bisa diubah atau dihapus oleh yang menyimpannya, atau oleh admin.</p>
        {custom.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-5 py-8 text-center text-sm text-fg-subtle">
            Belum ada templat tim. Buka halaman di editor, lalu pilih <span className="font-medium text-fg-muted">Simpan sebagai templat</span> di pengaturan halaman.
          </p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {custom.map((t) => (
              <CustomRow key={t.id} template={t} canEdit={admin || t.createdById === userId} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-sm font-semibold text-fg">Templat bawaan</h2>
        <p className="mb-4 text-xs text-fg-subtle">Disediakan Docsku; isinya teks contoh dalam kurung siku yang tinggal diganti.</p>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {builtin.map((t) => (
            <li key={t.id} className="flex flex-col rounded-xl border border-line bg-surface p-4">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                  <TemplateIcon name={t.icon} />
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-fg">{t.name}</h3>
                  <p className="mt-0.5 text-xs text-fg-muted">{t.description}</p>
                </div>
              </div>
              {t.outline.length > 0 && <p className="mt-3 line-clamp-2 text-xs text-fg-subtle">{t.outline.join(" · ")}</p>}
              <div className="mt-auto flex justify-end pt-3">
                <UseButton id={t.id} />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function CustomRow({ template, canEdit }: { template: TemplateChoice; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description);
  const [icon, setIcon] = useState(template.icon);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function save(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    start(async () => {
      const result = await updateTemplate(template.id, { name, description, icon });
      if (!result.ok) return setError(result.error);
      setEditing(false);
      router.refresh();
    });
  }

  async function remove() {
    const ok = await confirmDialog({
      title: `Hapus templat “${template.name}”?`,
      message: "Halaman yang sudah dibuat dari templat ini tidak ikut terhapus.",
      confirmLabel: "Hapus",
      tone: "danger",
    });
    if (!ok) return;
    start(async () => {
      const result = await deleteTemplate(template.id);
      if (!result.ok) return setError(result.error);
      router.refresh();
    });
  }

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-fill text-fg-muted">
          <TemplateIcon name={template.icon} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium text-fg">{template.name}</h3>
          {template.description && <p className="text-xs text-fg-muted">{template.description}</p>}
          <p className="mt-0.5 text-xs text-fg-subtle">
            {template.createdBy ? `Disimpan oleh ${template.createdBy}` : "Pembuatnya sudah dihapus"}
            {template.updatedAt && ` · ${formatDateTime(template.updatedAt)}`}
            {template.outline.length > 0 && ` · ${template.outline.length} bagian`}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <UseButton id={template.id} />
          {canEdit && (
            <>
              <button
                type="button"
                onClick={() => setEditing((v) => !v)}
                aria-expanded={editing}
                aria-label={`Ubah ${template.name}`}
                className="inline-flex size-8 items-center justify-center rounded-md text-fg-muted hover:bg-fill hover:text-fg"
              >
                <Pencil className="size-4" />
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={pending}
                aria-label={`Hapus ${template.name}`}
                className="inline-flex size-8 items-center justify-center rounded-md text-fg-muted hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
              >
                <Trash2 className="size-4" />
              </button>
            </>
          )}
        </div>
      </div>
      {error && !editing && (
        <div className="mt-2">
          <Alert>{error}</Alert>
        </div>
      )}
      {editing && (
        <form onSubmit={save} className="mt-3 space-y-3 rounded-lg border border-line bg-fill/40 p-3 sm:ml-12">
          {error && <Alert>{error}</Alert>}
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-fg-muted">Nama</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-fg-muted">Deskripsi</span>
            <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} className={inputClass} />
          </label>
          <div>
            <span className="mb-1 block text-xs font-medium text-fg-muted">Ikon</span>
            <IconPicker value={icon} onChange={setIcon} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(false)} className={buttonClass("ghost", "sm")}>
              Batal
            </button>
            <button type="submit" disabled={pending} className={buttonClass("primary", "sm")}>
              {pending ? "Menyimpan…" : "Simpan"}
            </button>
          </div>
        </form>
      )}
    </li>
  );
}
