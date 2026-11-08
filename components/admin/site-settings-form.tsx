"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { saveSiteSettings } from "@/app/admin/_actions/site";
import { RowControls, move, removeAt, replaceAt } from "@/components/admin/list-controls";
import { Alert, Button, Field, Input, Panel, Textarea, inputClass } from "@/components/admin/ui";
import type { ExternalLink, LocalizedSite, SiteSettings } from "@/lib/site-types";

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
        // Small screens: title + controls, then the address; wider: title | address | controls.
        <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 rounded-lg border border-line bg-page p-2 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto]">
          <input
            value={link.title}
            onChange={(e) => onChange(replaceAt(links, i, { ...link, title: e.target.value }))}
            placeholder="Judul"
            aria-label="Judul tautan"
            className={`${inputClass} h-8 min-w-0`}
          />
          <input
            value={link.href}
            onChange={(e) => onChange(replaceAt(links, i, { ...link, href: e.target.value }))}
            placeholder="/docs/… atau https://…"
            aria-label="Alamat tautan"
            className={`${inputClass} col-span-2 row-start-2 h-8 min-w-0 font-mono text-xs sm:col-span-1 sm:row-start-auto`}
          />
          {withDescription && (
            <input
              value={link.description ?? ""}
              onChange={(e) => onChange(replaceAt(links, i, { ...link, description: e.target.value || undefined }))}
              placeholder="Deskripsi (opsional)"
              aria-label="Deskripsi tautan"
              className={`${inputClass} col-span-2 h-8 min-w-0 sm:order-last sm:col-span-3`}
            />
          )}
          <div className="col-start-2 row-start-1 sm:col-start-3">
            <RowControls
              index={i}
              length={links.length}
              label={link.title || "tautan"}
              onMove={(from, to) => onChange(move(links, from, to))}
              onRemove={() => onChange(removeAt(links, i))}
            />
          </div>
        </div>
      ))}
      <Button size="sm" variant="ghost" onClick={() => onChange([...links, { title: "", href: "" }])}>
        <Plus className="size-3.5" />
        Tambah tautan
      </Button>
    </div>
  );
}

function CtaFields({ value, onChange }: { value: { title: string; href: string }; onChange: (value: { title: string; href: string }) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Teks tombol">
        <Input value={value.title} onChange={(e) => onChange({ ...value, title: e.target.value })} />
      </Field>
      <Field label="Tautan">
        <Input value={value.href} onChange={(e) => onChange({ ...value, href: e.target.value })} className="font-mono text-xs" />
      </Field>
    </div>
  );
}

type FooterColumns = SiteSettings["footer"];

function FooterColumnsEditor({ columns, onChange }: { columns: FooterColumns; onChange: (columns: FooterColumns) => void }) {
  return (
    <>
      {columns.map((column, i) => (
        <div key={i} className="space-y-3 rounded-xl border border-line p-3">
          <div className="flex items-center gap-2">
            <input
              value={column.title}
              onChange={(e) => onChange(replaceAt(columns, i, { ...column, title: e.target.value }))}
              placeholder="Judul kolom"
              aria-label="Judul kolom"
              className={`${inputClass} h-8 flex-1 font-medium`}
            />
            <RowControls
              index={i}
              length={columns.length}
              label={column.title || "kolom"}
              onMove={(from, to) => onChange(move(columns, from, to))}
              onRemove={() => onChange(removeAt(columns, i))}
            />
          </div>
          <LinkList links={column.links} onChange={(links) => onChange(replaceAt(columns, i, { ...column, links }))} />
        </div>
      ))}
      <Button size="sm" variant="secondary" onClick={() => onChange([...columns, { title: "", links: [] }])}>
        <Plus className="size-3.5" />
        Tambah kolom
      </Button>
    </>
  );
}

/**
 * Pengaturan → Umum. With extra languages (Pengaturan → Bahasa), a switcher
 * edits what readers of each language see: the description, the header button
 * and the footer columns (`site.localized[code]`); anything left "sama dengan
 * bahasa utama" falls back to the default language's.
 */
export function SiteSettingsForm({
  initial,
  languages = [],
  defaultLabel = "Bahasa utama",
}: {
  initial: SiteSettings;
  /** Extra languages; empty when the site has only its default language. */
  languages?: { code: string; label: string }[];
  defaultLabel?: string;
}) {
  const [site, setSite] = useState(initial);
  const [lang, setLang] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (patch: Partial<SiteSettings>) => setSite((current) => ({ ...current, ...patch }));
  const own: LocalizedSite = (lang && site.localized?.[lang]) || {};
  const setOwn = (patch: Partial<LocalizedSite>) =>
    lang && setSite((current) => ({ ...current, localized: { ...current.localized, [lang]: { ...current.localized?.[lang], ...patch } } }));
  const label = languages.find((language) => language.code === lang)?.label;

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await saveSiteSettings(site);
      setMessage(result.ok ? { tone: "success", text: "Pengaturan disimpan dan langsung tampil di situs." } : { tone: "error", text: result.error });
    });
  }

  // "same" = use the default language's; "own" = this language's own; "none" = hidden for this language.
  const ctaMode = own.headerCta === undefined ? "same" : own.headerCta === null ? "none" : "own";

  return (
    <div className="max-w-3xl space-y-6">
      {languages.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-fg-muted">Untuk pembaca:</span>
          <div role="tablist" aria-label="Bahasa" className="flex gap-1 rounded-lg bg-fill p-1">
            {[{ code: "", label: defaultLabel }, ...languages].map((language) => {
              const active = (lang ?? "") === language.code;
              return (
                <button
                  key={language.code || "default"}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setLang(language.code || null)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${active ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg"}`}
                >
                  {language.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {lang ? (
        <>
          <Panel className="space-y-4 p-5">
            <h2 className="text-sm font-medium">Identitas · {label}</h2>
            <p className="text-xs text-fg-subtle">Nama situs sama untuk semua bahasa. Kosongkan deskripsi untuk memakai deskripsi bahasa utama.</p>
            <Field label="Deskripsi" hint="Meta description dan footer halaman berbahasa ini.">
              <Textarea value={own.description ?? ""} onChange={(e) => setOwn({ description: e.target.value || undefined })} rows={2} placeholder={site.description} />
            </Field>
          </Panel>

          <Panel className="space-y-4 p-5">
            <h2 className="text-sm font-medium">Tombol di header · {label}</h2>
            <div className="flex flex-wrap gap-4 text-sm">
              {(
                [
                  ["same", "Sama dengan bahasa utama"],
                  ["own", "Tombol sendiri"],
                  ["none", "Sembunyikan"],
                ] as const
              ).map(([mode, text]) => (
                <label key={mode} className="flex items-center gap-2 text-fg-muted">
                  <input
                    type="radio"
                    name={`cta-${lang}`}
                    checked={ctaMode === mode}
                    onChange={() => setOwn({ headerCta: mode === "same" ? undefined : mode === "none" ? null : (site.headerCta ?? { title: "Get started", href: `/docs/${lang}` }) })}
                    className="accent-accent"
                  />
                  {text}
                </label>
              ))}
            </div>
            {own.headerCta && <CtaFields value={own.headerCta} onChange={(headerCta) => setOwn({ headerCta })} />}
          </Panel>

          <Panel className="space-y-4 p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-medium">Kolom footer · {label}</h2>
              <label className="flex items-center gap-2 text-sm text-fg-muted">
                <input
                  type="checkbox"
                  checked={own.footer !== undefined}
                  onChange={(e) => setOwn({ footer: e.target.checked ? structuredClone(site.footer) : undefined })}
                  className="accent-accent"
                />
                Pakai kolom sendiri
              </label>
            </div>
            {own.footer ? (
              <FooterColumnsEditor columns={own.footer} onChange={(footer) => setOwn({ footer })} />
            ) : (
              <p className="text-xs text-fg-subtle">Pembaca {label} melihat kolom footer bahasa utama. Centang untuk menerjemahkan judul dan tautannya.</p>
            )}
          </Panel>
          <p className="text-xs text-fg-subtle">Menu “Sumber daya” sama untuk semua bahasa.</p>
        </>
      ) : (
        <>
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
            {site.headerCta && <CtaFields value={site.headerCta} onChange={(headerCta) => set({ headerCta })} />}
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
            <FooterColumnsEditor columns={site.footer} onChange={(footer) => set({ footer })} />
          </Panel>
        </>
      )}

      <div className="sticky bottom-0 -mx-1 flex items-center gap-3 border-t border-line bg-page/95 px-1 py-4 backdrop-blur">
        <Button variant="accent" onClick={save} disabled={pending}>
          {pending ? "Menyimpan…" : "Simpan pengaturan"}
        </Button>
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
      </div>
    </div>
  );
}
