"use client";

import { useState, useTransition } from "react";
import { FileText, FolderTree, Link2, Plus } from "lucide-react";
import { saveNavigation } from "@/app/admin/_actions/site";
import { RowControls, move, removeAt, replaceAt } from "@/components/admin/list-controls";
import { Alert, Button, Panel, inputClass } from "@/components/admin/ui";
import type { NavigationData, NavItemData, NavSectionData, NavTabData } from "@/lib/site-types";

type PageOption = { id: string; slug: string; title: string; status: "draft" | "scheduled" | "published" };

const STATUS_NOTE = { draft: " · draf", scheduled: " · terjadwal", published: "" };
const small = `${inputClass} h-8 text-sm`;

function collectPageIds(items: NavItemData[], into: Set<string>) {
  for (const item of items) {
    if (item.type === "page") into.add(item.pageId);
    if (item.type === "group") collectPageIds(item.items, into);
  }
  return into;
}

function ItemList({
  items,
  pages,
  depth,
  onChange,
}: {
  items: NavItemData[];
  pages: PageOption[];
  depth: number;
  onChange: (items: NavItemData[]) => void;
}) {
  const firstPage = pages[0];
  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const update = (value: NavItemData) => onChange(replaceAt(items, i, value));
        const controls = (
          <RowControls
            index={i}
            length={items.length}
            label={item.type === "page" ? "halaman" : item.title || "item"}
            onMove={(from, to) => onChange(move(items, from, to))}
            onRemove={() => onChange(removeAt(items, i))}
          />
        );

        if (item.type === "page") {
          const page = pages.find((p) => p.id === item.pageId);
          return (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface p-2">
              <FileText className="size-4 shrink-0 text-fg-subtle" />
              <select
                value={item.pageId}
                onChange={(e) => update({ ...item, pageId: e.target.value })}
                aria-label="Halaman"
                className={`${small} w-56 flex-1 pr-6`}
              >
                {!page && <option value={item.pageId}>(halaman terhapus)</option>}
                {pages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {(p.title || "Tanpa judul") + STATUS_NOTE[p.status]}
                  </option>
                ))}
              </select>
              <input
                value={item.title ?? ""}
                onChange={(e) => update({ ...item, title: e.target.value || undefined })}
                placeholder={page?.title || "Label"}
                aria-label="Label di sidebar"
                title="Label di sidebar (kosongkan untuk memakai judul halaman)"
                className={`${small} w-40 flex-1`}
              />
              {controls}
            </div>
          );
        }

        if (item.type === "link") {
          return (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface p-2">
              <Link2 className="size-4 shrink-0 text-fg-subtle" />
              <input
                value={item.title}
                onChange={(e) => update({ ...item, title: e.target.value })}
                placeholder="Judul tautan"
                aria-label="Judul tautan"
                className={`${small} w-40 flex-1`}
              />
              <input
                value={item.href}
                onChange={(e) => update({ ...item, href: e.target.value })}
                placeholder="https://…"
                aria-label="Alamat tautan"
                className={`${small} w-48 flex-1 font-mono text-xs`}
              />
              {controls}
            </div>
          );
        }

        return (
          <div key={i} className="rounded-lg border border-dashed border-line-strong p-2">
            <div className="mb-2 flex items-center gap-2">
              <FolderTree className="size-4 shrink-0 text-fg-subtle" />
              <input
                value={item.title}
                onChange={(e) => update({ ...item, title: e.target.value })}
                placeholder="Nama grup"
                aria-label="Nama grup"
                className={`${small} flex-1 font-medium`}
              />
              {controls}
            </div>
            <div className="pl-6">
              <ItemList items={item.items} pages={pages} depth={depth + 1} onChange={(children) => update({ ...item, items: children })} />
            </div>
          </div>
        );
      })}

      <div className="flex flex-wrap gap-1">
        {firstPage && (
          <Button size="sm" variant="ghost" onClick={() => onChange([...items, { type: "page", pageId: firstPage.id }])}>
            <Plus className="size-3.5" />
            Halaman
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => onChange([...items, { type: "link", title: "", href: "https://" }])}>
          <Plus className="size-3.5" />
          Tautan
        </Button>
        {depth < 2 && (
          <Button size="sm" variant="ghost" onClick={() => onChange([...items, { type: "group", title: "", items: [] }])}>
            <Plus className="size-3.5" />
            Grup
          </Button>
        )}
      </div>
    </div>
  );
}

export function NavigationEditor({ initial, pages }: { initial: NavigationData; pages: PageOption[] }) {
  const [tabs, setTabs] = useState<NavTabData[]>(initial.tabs);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const used = new Set<string>();
  for (const tab of tabs) for (const section of tab.sections) collectPageIds(section.items, used);
  const unused = pages.filter((page) => page.status === "published" && !used.has(page.id));

  const updateTab = (i: number, tab: NavTabData) => setTabs(replaceAt(tabs, i, tab));
  const updateSection = (tab: NavTabData, i: number, s: number, section: NavSectionData) =>
    updateTab(i, { ...tab, sections: replaceAt(tab.sections, s, section) });

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await saveNavigation({ tabs });
      setMessage(result.ok ? { tone: "success", text: "Navigasi disimpan dan langsung tampil di situs." } : { tone: "error", text: result.error });
    });
  }

  return (
    <div className="space-y-6">
      {unused.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          {unused.length} halaman terbit belum ada di navigasi, jadi tidak muncul di sidebar dan pencarian:{" "}
          {unused.map((page) => page.title || page.slug).join(", ")}.
        </div>
      )}

      {tabs.map((tab, i) => (
        <Panel key={tab.id} className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <span className="text-xs font-medium tracking-wide text-fg-subtle uppercase">Tab</span>
            <input
              value={tab.title}
              onChange={(e) => updateTab(i, { ...tab, title: e.target.value })}
              placeholder="Nama tab di header"
              aria-label="Nama tab"
              className={`${inputClass} flex-1 font-medium`}
            />
            <RowControls
              index={i}
              length={tabs.length}
              label={tab.title || "tab"}
              onMove={(from, to) => setTabs(move(tabs, from, to))}
              onRemove={() => confirm(`Hapus tab "${tab.title}" beserta isinya dari navigasi?`) && setTabs(removeAt(tabs, i))}
            />
          </div>

          <div className="space-y-4">
            {tab.sections.map((section, s) => (
              <div key={section.id} className="rounded-xl bg-fill/50 p-3">
                <div className="mb-3 flex items-center gap-2">
                  <input
                    value={section.title}
                    onChange={(e) => updateSection(tab, i, s, { ...section, title: e.target.value })}
                    placeholder="Judul section di sidebar"
                    aria-label="Judul section"
                    className={`${small} flex-1 font-medium`}
                  />
                  <RowControls
                    index={s}
                    length={tab.sections.length}
                    label={section.title || "section"}
                    onMove={(from, to) => updateTab(i, { ...tab, sections: move(tab.sections, from, to) })}
                    onRemove={() => updateTab(i, { ...tab, sections: removeAt(tab.sections, s) })}
                  />
                </div>
                <ItemList
                  items={section.items}
                  pages={pages}
                  depth={1}
                  onChange={(items) => updateSection(tab, i, s, { ...section, items })}
                />
              </div>
            ))}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => updateTab(i, { ...tab, sections: [...tab.sections, { id: crypto.randomUUID(), title: "", items: [] }] })}
            >
              <Plus className="size-3.5" />
              Tambah section
            </Button>
          </div>
        </Panel>
      ))}

      <Button variant="secondary" onClick={() => setTabs([...tabs, { id: crypto.randomUUID(), title: "", sections: [] }])}>
        <Plus className="size-4" />
        Tambah tab
      </Button>

      <div className="sticky bottom-0 -mx-1 flex items-center gap-3 border-t border-line bg-page/95 px-1 py-4 backdrop-blur">
        <Button variant="accent" onClick={save} disabled={pending}>
          {pending ? "Menyimpan…" : "Simpan navigasi"}
        </Button>
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
      </div>
    </div>
  );
}
