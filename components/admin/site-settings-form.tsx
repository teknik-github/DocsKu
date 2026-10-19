"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { saveSiteSettings } from "@/app/admin/_actions/site";
import { RowControls, move, removeAt, replaceAt } from "@/components/admin/list-controls";
import { Alert, Button, Field, Input, Panel, Textarea, inputClass } from "@/components/admin/ui";
import type { ExternalLink, SiteSettings } from "@/lib/site-types";

function LinkList({
  links,
  onChange,
  withDescription = false,
}: {
  links: ExternalLink[];
  onChange: (links: ExternalLink[]) => void;
  withDescription?: boolean;
}) {
  return (
    <div className="space-y-2">
      {links.map((link, i) => (
        <div key={i} className="flex flex-wrap items-start gap-2 rounded-lg border border-line bg-page p-2">
          <input
            value={link.title}
            onChange={(e) => onChange(replaceAt(links, i, { ...link, title: e.target.value }))}
            placeholder="Judul"
            aria-label="Judul tautan"
            className={`${inputClass} h-8 w-40 flex-1`}
          />
          <input
            value={link.href}
            onChange={(e) => onChange(replaceAt(links, i, { ...link, href: e.target.value }))}
            placeholder="/docs/… atau https://…"
            aria-label="Alamat tautan"
            className={`${inputClass} h-8 w-48 flex-1 font-mono text-xs`}
          />
          {withDescription && (
            <input
              value={link.description ?? ""}
              onChange={(e) => onChange(replaceAt(links, i, { ...link, description: e.target.value || undefined }))}
              placeholder="Deskripsi (opsional)"
              aria-label="Deskripsi tautan"
              className={`${inputClass} h-8 w-full`}
            />
          )}
          <RowControls
            index={i}
            length={links.length}
            label={link.title || "tautan"}
            onMove={(from, to) => onChange(move(links, from, to))}
            onRemove={() => onChange(removeAt(links, i))}
          />
        </div>
      ))}
      <Button size="sm" variant="ghost" onClick={() => onChange([...links, { title: "", href: "" }])}>
        <Plus className="size-3.5" />
        Tambah tautan
      </Button>
    </div>
  );
}

export function SiteSettingsForm({ initial }: { initial: SiteSettings }) {
  const [site, setSite] = useState(initial);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (patch: Partial<SiteSettings>) => setSite((current) => ({ ...current, ...patch }));

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await saveSiteSettings(site);
      setMessage(result.ok ? { tone: "success", text: "Pengaturan disimpan dan langsung tampil di situs." } : { tone: "error", text: result.error });
    });
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Panel className="space-y-4 p-5">
        <h2 className="text-sm font-medium">Identitas</h2>
        <Field label="Nama situs" hint="Tampil di logo, judul tab browser, dan footer.">
          <Input value={site.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="Deskripsi" hint="Dipakai untuk meta description dan footer.">
          <Textarea value={site.description} onChange={(e) => set({ description: e.target.value })} rows={2} />
        </Field>
      </Panel>

      <Panel className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Tombol di header</h2>
          <label className="flex items-center gap-2 text-sm text-fg-muted">
            <input
              type="checkbox"
              checked={site.headerCta !== null}
              onChange={(e) => set({ headerCta: e.target.checked ? { title: "Mulai", href: "/docs" } : null })}
              className="accent-accent"
            />
            Tampilkan
          </label>
        </div>
        {site.headerCta && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Teks tombol">
              <Input value={site.headerCta.title} onChange={(e) => set({ headerCta: { ...site.headerCta!, title: e.target.value } })} />
            </Field>
            <Field label="Tautan">
              <Input
                value={site.headerCta.href}
                onChange={(e) => set({ headerCta: { ...site.headerCta!, href: e.target.value } })}
                className="font-mono text-xs"
              />
            </Field>
          </div>
        )}
      </Panel>

      <Panel className="space-y-3 p-5">
        <div>
          <h2 className="text-sm font-medium">Menu &ldquo;Sumber daya&rdquo;</h2>
          <p className="mt-1 text-xs text-fg-subtle">Dropdown di header. Kosongkan untuk menyembunyikannya.</p>
        </div>
        <LinkList links={site.resources} onChange={(resources) => set({ resources })} withDescription />
      </Panel>

      <Panel className="space-y-4 p-5">
        <h2 className="text-sm font-medium">Kolom footer</h2>
        {site.footer.map((column, i) => (
          <div key={i} className="space-y-3 rounded-xl border border-line p-3">
            <div className="flex items-center gap-2">
              <input
                value={column.title}
                onChange={(e) => set({ footer: replaceAt(site.footer, i, { ...column, title: e.target.value }) })}
                placeholder="Judul kolom"
                aria-label="Judul kolom"
                className={`${inputClass} h-8 flex-1 font-medium`}
              />
              <RowControls
                index={i}
                length={site.footer.length}
                label={column.title || "kolom"}
                onMove={(from, to) => set({ footer: move(site.footer, from, to) })}
                onRemove={() => set({ footer: removeAt(site.footer, i) })}
              />
            </div>
            <LinkList links={column.links} onChange={(links) => set({ footer: replaceAt(site.footer, i, { ...column, links }) })} />
          </div>
        ))}
        <Button size="sm" variant="secondary" onClick={() => set({ footer: [...site.footer, { title: "", links: [] }] })}>
          <Plus className="size-3.5" />
          Tambah kolom
        </Button>
      </Panel>

      <div className="sticky bottom-0 -mx-1 flex items-center gap-3 border-t border-line bg-page/95 px-1 py-4 backdrop-blur">
        <Button variant="accent" onClick={save} disabled={pending}>
          {pending ? "Menyimpan…" : "Simpan pengaturan"}
        </Button>
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
      </div>
    </div>
  );
}
