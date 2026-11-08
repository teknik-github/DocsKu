"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, FolderInput, Globe, Lock, Trash2 } from "lucide-react";
import { deletePages } from "@/app/admin/_actions/pages";
import { movePagesToCategory } from "@/app/admin/_actions/categories";
import { setPagesVisibility } from "@/app/admin/_actions/visibility";
import type { CategoryGroup } from "@/lib/categories";
import { formatDateTime } from "@/components/admin/format";
import { Button, Panel, StatusBadge } from "@/components/admin/ui";
import { confirmDialog } from "@/components/admin/dialog";
import { Avatar } from "@/components/avatar";
import { QUALITY_FAIR, QUALITY_GOOD } from "@/components/admin/editor/quality";

type Row = {
  id: string;
  slug: string;
  title: string;
  status: "draft" | "scheduled" | "published";
  hasChanges: boolean;
  /** "internal": readable only by signed-in team members. */
  visibility?: "public" | "internal";
  publishedAt: string | null;
  updatedAt: string;
  updatedBy: string | null;
  /** "Group › Category", shown in the all-pages view. */
  category?: string | null;
  /** Not listed yet: joins its category when published. */
  pendingCategory?: boolean;
  /** Set on a translation: its language code. */
  locale?: string | null;
  /** On an original: its translations, shown as language badges. */
  translations?: { id: string; locale: string; status: "draft" | "scheduled" | "published"; outdated?: boolean }[];
  /** Approval workflow: "pending" (submitted) or "changes_requested". */
  approvalStatus?: string | null;
  /** People with the page open in the editor right now. */
  editing?: { name: string; avatar: string | null }[];
  /** Writing-check score of the working copy (0–100) and its warnings. */
  quality?: { score: number; issues: string[] };
};

const NO_CATEGORY = "__none";

export function PagesTable({
  pages,
  showCategory = false,
  moveTargets,
  staff = true,
  empty = "Tidak ada halaman yang cocok.",
}: {
  pages: Row[];
  showCategory?: boolean;
  /** Admins and editors; contributors don't get the visibility actions. */
  staff?: boolean;
  /** Categories to move selected pages to (admins only). */
  moveTargets?: CategoryGroup[];
  empty?: React.ReactNode;
}) {
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

  function moveSelected(target: string) {
    if (!target) return;
    setError("");
    startTransition(async () => {
      const result = await movePagesToCategory([...selected], target === NO_CATEGORY ? null : target);
      if (!result.ok) setError(result.error);
      else {
        setSelected(new Set());
        router.refresh();
      }
    });
  }

  function setVisibility(visibility: "public" | "internal") {
    setError("");
    startTransition(async () => {
      const result = await setPagesVisibility([...selected], visibility);
      if (!result.ok) setError(result.error);
      else {
        setSelected(new Set());
        router.refresh();
      }
    });
  }

  async function removeSelected() {
    const ok = await confirmDialog({
      title: `Hapus ${selected.size} halaman?`,
      message: "Halaman beserta semua revisinya dihapus permanen. Tindakan ini tidak bisa dibatalkan.",
      confirmLabel: "Hapus halaman",
      tone: "danger",
    });
    if (!ok) return;
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
      <Panel className="px-5 py-14 text-center text-sm text-fg-subtle">{empty}</Panel>
    );
  }

  return (
    <Panel className="overflow-hidden">
      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-3 border-b border-line bg-fill/50 px-4 py-2">
          <span className="text-sm text-fg-muted">{selected.size} dipilih</span>
          <div className="flex items-center gap-2">
            {moveTargets && (
              <label className="relative flex items-center">
                <FolderInput className="pointer-events-none absolute left-2.5 size-3.5 text-fg-muted" />
                <select
                  aria-label="Pindahkan ke kategori"
                  value=""
                  disabled={pending}
                  onChange={(e) => moveSelected(e.target.value)}
                  className="h-8 rounded-lg border border-line bg-surface pr-7 pl-8 text-xs text-fg"
                >
                  <option value="">Pindahkan ke…</option>
                  {moveTargets.map((group) => (
                    <optgroup key={group.id} label={group.title}>
                      {group.categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.title}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                  <option value={NO_CATEGORY}>Tanpa kategori</option>
                </select>
              </label>
            )}
            {staff && [...selected].some((id) => pages.find((p) => p.id === id)?.visibility !== "internal") && (
              <Button variant="secondary" size="sm" onClick={() => setVisibility("internal")} disabled={pending} title="Hanya tim yang masuk yang bisa membaca">
                <Lock className="size-3.5" />
                Jadikan internal
              </Button>
            )}
            {staff && [...selected].some((id) => pages.find((p) => p.id === id)?.visibility === "internal") && (
              <Button variant="secondary" size="sm" onClick={() => setVisibility("public")} disabled={pending}>
                <Globe className="size-3.5" />
                Jadikan publik
              </Button>
            )}
            <Button variant="danger" size="sm" onClick={removeSelected} disabled={pending}>
              <Trash2 className="size-3.5" />
              Hapus
            </Button>
          </div>
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
              <th className={`${showCategory ? "w-[42%]" : "w-[55%]"} py-2.5 pr-4 font-medium`}>Judul</th>
              {showCategory && <th className="hidden w-44 py-2.5 pr-4 font-medium lg:table-cell">Kategori</th>}
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
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate font-medium text-fg group-hover:text-accent">{page.title || "Tanpa judul"}</span>
                      {page.visibility === "internal" && (
                        <span
                          title="Artikel internal: hanya untuk tim yang masuk"
                          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-200"
                        >
                          <Lock className="size-2.5" />
                          Internal
                        </span>
                      )}
                      {page.locale && (
                        <span title={`Terjemahan (${page.locale})`} className="shrink-0 rounded bg-accent-soft px-1.5 py-0.5 font-mono text-[10px] font-semibold text-accent uppercase">
                          {page.locale}
                        </span>
                      )}
                      {page.translations?.map((translation) => (
                        <span
                          key={translation.id}
                          data-testid="translation-badge"
                          title={`Terjemahan ${translation.locale}: ${translation.status === "published" ? "terbit" : translation.status === "scheduled" ? "terjadwal" : "draf"}`}
                          className={`shrink-0 rounded px-1 py-0.5 font-mono text-[10px] uppercase ${
                            translation.status === "published" ? "bg-fill text-fg-muted" : "border border-dashed border-line text-fg-subtle"
                          }`}
                        >
                          {translation.locale}
                        </span>
                      ))}
                    </span>
                    <span className="block truncate font-mono text-xs text-fg-subtle">/docs/{page.slug}</span>
                  </Link>
                </td>
                {showCategory && (
                  <td className="hidden max-w-0 py-3 pr-4 lg:table-cell">
                    <span
                      title={page.category ?? undefined}
                      className={`block truncate text-xs ${page.category ? "text-fg-muted" : "text-fg-subtle italic"}`}
                    >
                      {page.category?.split(" › ").pop() ?? "Tanpa kategori"}
                    </span>
                  </td>
                )}
                <td className="py-3 pr-4 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5">
                    <StatusBadge status={page.status} />
                    {page.editing && page.editing.length > 0 && (
                      <span
                        data-testid="row-presence"
                        title={`Sedang diedit: ${page.editing.map((p) => p.name).join(", ")}`}
                        className="inline-flex -space-x-1"
                      >
                        {page.editing.slice(0, 3).map((p) => (
                          <Avatar key={p.name} name={p.name} src={p.avatar} size={18} className="ring-2 ring-surface" />
                        ))}
                      </span>
                    )}
                  </span>
                  {page.approvalStatus === "pending" && (
                    <span className="mt-0.5 block text-xs font-medium text-sky-700 dark:text-sky-300">Menunggu persetujuan</span>
                  )}
                  {page.approvalStatus === "changes_requested" && (
                    <span className="mt-0.5 block text-xs font-medium text-orange-700 dark:text-orange-300">Diminta perubahan</span>
                  )}
                  {page.hasChanges && (
                    <span className="ml-1.5 text-[11px] text-amber-600 dark:text-amber-400">• ada perubahan</span>
                  )}
                  {page.quality && <QualityBadge quality={page.quality} />}
                  {page.pendingCategory && (
                    <span className="mt-0.5 block text-xs text-fg-subtle">masuk kategori saat terbit</span>
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

/** Writing-check score: green from 85, amber from 60, red below; the warnings show on hover. */
function QualityBadge({ quality }: { quality: { score: number; issues: string[] } }) {
  const tone =
    quality.score >= QUALITY_GOOD
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
      : quality.score >= QUALITY_FAIR
        ? "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
        : "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300";
  const title = quality.issues.length ? `Kualitas ${quality.score}/100:\n• ${quality.issues.join("\n• ")}` : `Kualitas ${quality.score}/100: tidak ada masalah`;
  return (
    <span title={title} data-testid="quality-score" className={`mt-0.5 ml-0 block w-fit rounded-full px-1.5 py-px text-[11px] font-medium tabular-nums ${tone}`}>
      Kualitas {quality.score}
    </span>
  );
}
