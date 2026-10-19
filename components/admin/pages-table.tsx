"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Trash2 } from "lucide-react";
import { deletePages } from "@/app/admin/_actions/pages";
import { formatDateTime } from "@/components/admin/format";
import { Button, Panel, StatusBadge } from "@/components/admin/ui";

type Row = {
  id: string;
  slug: string;
  title: string;
  status: "draft" | "scheduled" | "published";
  hasChanges: boolean;
  publishedAt: string | null;
  updatedAt: string;
  updatedBy: string | null;
};

export function PagesTable({ pages }: { pages: Row[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const allSelected = pages.length > 0 && pages.every((page) => selected.has(page.id));
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  function removeSelected() {
    if (!confirm(`Hapus ${selected.size} halaman? Tindakan ini tidak bisa dibatalkan.`)) return;
    startTransition(async () => {
      const result = await deletePages([...selected]);
      if (!result.ok) setError(result.error);
      else {
        setSelected(new Set());
        router.refresh();
      }
    });
  }

  if (pages.length === 0) {
    return (
      <Panel className="px-5 py-14 text-center text-sm text-fg-subtle">Tidak ada halaman yang cocok.</Panel>
    );
  }

  return (
    <Panel className="overflow-hidden">
      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-3 border-b border-line bg-fill/50 px-4 py-2">
          <span className="text-sm text-fg-muted">{selected.size} dipilih</span>
          <Button variant="danger" size="sm" onClick={removeSelected} disabled={pending}>
            <Trash2 className="size-3.5" />
            Hapus
          </Button>
        </div>
      )}
      {error && <p className="border-b border-line px-4 py-2 text-sm text-red-600">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-fg-subtle">
              <th className="w-10 px-4 py-2.5">
                <input
                  type="checkbox"
                  aria-label="Pilih semua"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(pages.map((p) => p.id)))}
                  className="accent-accent"
                />
              </th>
              <th className="w-[55%] py-2.5 pr-4 font-medium">Judul</th>
              <th className="py-2.5 pr-4 font-medium">Status</th>
              <th className="hidden py-2.5 pr-4 font-medium md:table-cell">Diubah</th>
              <th className="w-10 py-2.5 pr-4" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {pages.map((page) => (
              <tr key={page.id} className="group hover:bg-fill/40">
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label={`Pilih ${page.title || page.slug}`}
                    checked={selected.has(page.id)}
                    onChange={() => toggle(page.id)}
                    className="accent-accent"
                  />
                </td>
                <td className="max-w-0 py-3 pr-4">
                  <Link href={`/admin/pages/${page.id}`} className="block">
                    <span className="block truncate font-medium text-fg group-hover:text-accent">
                      {page.title || "Tanpa judul"}
                    </span>
                    <span className="block truncate font-mono text-xs text-fg-subtle">/docs/{page.slug}</span>
                  </Link>
                </td>
                <td className="py-3 pr-4 whitespace-nowrap">
                  <StatusBadge status={page.status} />
                  {page.hasChanges && (
                    <span className="ml-1.5 text-[11px] text-amber-600 dark:text-amber-400">• ada perubahan</span>
                  )}
                  {page.status === "scheduled" && (
                    <span className="mt-0.5 block text-xs text-fg-subtle">{formatDateTime(page.publishedAt)}</span>
                  )}
                </td>
                <td className="hidden py-3 pr-4 whitespace-nowrap text-fg-muted md:table-cell">
                  {formatDateTime(page.updatedAt)}
                  {page.updatedBy && <span className="block text-xs text-fg-subtle">{page.updatedBy}</span>}
                </td>
                <td className="py-3 pr-4">
                  {page.status === "published" && (
                    <a
                      href={`/docs/${page.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Buka di situs"
                      className="inline-flex size-7 items-center justify-center rounded-md text-fg-subtle hover:bg-fill hover:text-fg"
                    >
                      <ExternalLink className="size-3.5" />
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
