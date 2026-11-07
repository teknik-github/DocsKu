"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ImagePlus, Plus, Trash2 } from "lucide-react";
import { ImageDialog } from "@/components/admin/editor/image-dialog";
import { Field, Input, Select, Textarea, Button } from "@/components/admin/ui";
import { Icon, iconNames } from "@/components/icon";
import type { HomeButton, HomeSection } from "@/lib/site-types";

/** Where links can point: published pages (suggested in link fields) and the docs index. */
export type LinkOption = { href: string; title: string };

type Props<S extends HomeSection = HomeSection> = { section: S; onChange: (next: S) => void; pages: LinkOption[] };
type Of<T extends HomeSection["type"]> = Extract<HomeSection, { type: T }>;

/** The form for one section: its own fields, then layout (width, background). */
export function SectionForm({ section, onChange, pages }: Props) {
  const set = (patch: Partial<HomeSection>) => onChange({ ...section, ...patch } as HomeSection);
  return (
    <div className="space-y-5">
      <Fields section={section} onChange={onChange} pages={pages} />
      <Group title="Tata letak">
        {section.type !== "hero" && (
          <Field label="Lebar" hint="Dua bagian “Setengah” berurutan tampil berdampingan di layar lebar.">
            <Segmented
              value={section.width}
              options={[
                ["full", "Penuh"],
                ["half", "Setengah"],
              ]}
              onChange={(width) => set({ width })}
            />
          </Field>
        )}
        <Field label="Latar" hint={section.type === "hero" ? "Gambar latar (di atas) menggantikan warna ini." : undefined}>
          <Segmented
            value={section.tone}
            options={[
              ["plain", "Polos"],
              ["muted", "Abu"],
              ["accent", section.type === "hero" ? "Gradasi" : "Aksen"],
            ]}
            onChange={(tone) => set({ tone })}
          />
        </Field>
      </Group>
      <datalist id="docsku-links">
        <option value="/docs">Semua dokumentasi</option>
        {pages.map((page) => (
          <option key={page.href} value={page.href}>
            {page.title}
          </option>
        ))}
      </datalist>
    </div>
  );
}

function Fields({ section, onChange, pages }: Props) {
  switch (section.type) {
    case "hero":
      return <HeroFields section={section} onChange={onChange} />;
    case "categories":
      return <CategoriesFields section={section} onChange={onChange} />;
    case "articles":
      return <ArticlesFields section={section} onChange={onChange} pages={pages} />;
    case "features":
      return <FeaturesFields section={section} onChange={onChange} />;
    case "textImage":
      return <TextImageFields section={section} onChange={onChange} />;
    case "faq":
      return <FaqFields section={section} onChange={onChange} />;
    case "stats":
      return <StatsFields section={section} onChange={onChange} />;
    case "cta":
      return <CtaFields section={section} onChange={onChange} />;
    case "content":
      return (
        <Field label="Konten (Markdown)" hint="Bisa memakai komponen dokumentasi: <Note>, <Tip>, <Warning>, <Steps>, <Tabs>, <CardGroup>, blok kode, dan lainnya.">
          <Textarea value={section.markdown} onChange={(e) => onChange({ ...section, markdown: e.target.value })} rows={16} className="font-mono text-xs" />
        </Field>
      );
  }
}

// ---- Per type ----

function HeroFields({ section: s, onChange }: { section: Of<"hero">; onChange: (s: HomeSection) => void }) {
  const set = (patch: Partial<Of<"hero">>) => onChange({ ...s, ...patch });
  return (
    <>
      <Field label="Label kecil" hint="Kosong: “Pusat bantuan” dan nama situs.">
        <Input value={s.eyebrow} onChange={(e) => set({ eyebrow: e.target.value })} maxLength={80} />
      </Field>
      <Field label="Judul">
        <Input value={s.title} onChange={(e) => set({ title: e.target.value })} maxLength={160} />
      </Field>
      <Field label="Subjudul" hint="Kosong: deskripsi situs.">
        <Textarea value={s.subtitle} onChange={(e) => set({ subtitle: e.target.value })} rows={2} maxLength={400} />
      </Field>
      <Toggle checked={s.showSearch} onChange={(showSearch) => set({ showSearch })} label="Kotak pencarian" />
      {s.showSearch && (
        <Field label="Teks di kotak pencarian">
          <Input value={s.searchLabel} onChange={(e) => set({ searchLabel: e.target.value })} maxLength={80} />
        </Field>
      )}
      <Toggle checked={s.showPopular} onChange={(showPopular) => set({ showPopular })} label="Chip “Populer” (4 artikel teratas)" />
      <Field label="Perataan">
        <Segmented
          value={s.align}
          options={[
            ["center", "Tengah"],
            ["left", "Kiri"],
          ]}
          onChange={(align) => set({ align })}
        />
      </Field>
      <ImageField label="Gambar latar" value={s.image} onChange={(image) => set({ image })} hint="Digelapkan otomatis agar teks putih tetap terbaca." />
      <ButtonsField value={s.buttons} onChange={(buttons) => set({ buttons })} />
    </>
  );
}

function CategoriesFields({ section: s, onChange }: { section: Of<"categories">; onChange: (s: HomeSection) => void }) {
  const set = (patch: Partial<Of<"categories">>) => onChange({ ...s, ...patch });
  return (
    <>
      <p className="rounded-lg bg-fill px-3 py-2 text-xs text-fg-muted">Kartu dibuat otomatis dari kategori di menu Halaman, termasuk gambar kategorinya.</p>
      <Field label="Judul">
        <Input value={s.title} onChange={(e) => set({ title: e.target.value })} maxLength={120} />
      </Field>
      <ColumnsField value={s.columns} onChange={(columns) => set({ columns })} />
      <Field label="Artikel per kartu" hint="Sisanya di “Lihat semua”. 0: hanya nama kategori.">
        <Input type="number" min={0} max={20} value={s.links} onChange={(e) => set({ links: clamp(e.target.value, 0, 20) })} />
      </Field>
      <Toggle checked={s.groupByTab} onChange={(groupByTab) => set({ groupByTab })} label="Kelompokkan per grup (tab)" />
    </>
  );
}

function ArticlesFields({ section: s, onChange, pages }: { section: Of<"articles">; onChange: (s: HomeSection) => void; pages: LinkOption[] }) {
  const set = (patch: Partial<Of<"articles">>) => onChange({ ...s, ...patch });
  const title = new Map(pages.map((p) => [p.href, p.title]));
  return (
    <>
      <Field label="Judul">
        <Input value={s.title} onChange={(e) => set({ title: e.target.value })} maxLength={120} />
      </Field>
      <Field label="Sumber">
        <Select value={s.source} onChange={(e) => set({ source: e.target.value as Of<"articles">["source"] })}>
          <option value="popular">Paling sering dibaca (30 hari)</option>
          <option value="latest">Baru diterbitkan</option>
          <option value="featured">Unggulan</option>
          <option value="manual">Pilih sendiri</option>
        </Select>
      </Field>
      {s.source === "manual" && (
        <div>
          <span className="mb-1.5 block text-sm font-medium text-fg">Artikel pilihan</span>
          <Repeater
            items={s.pages}
            onChange={(next) => set({ pages: next })}
            render={(href) => <span className="truncate text-sm">{title.get(href) ?? href}</span>}
          />
          <Select
            className="mt-2"
            value=""
            onChange={(e) => e.target.value && set({ pages: [...s.pages, e.target.value] })}
            disabled={s.pages.length >= 24}
          >
            <option value="">+ Tambah artikel…</option>
            {pages
              .filter((p) => !s.pages.includes(p.href))
              .map((p) => (
                <option key={p.href} value={p.href}>
                  {p.title}
                </option>
              ))}
          </Select>
        </div>
      )}
      <Field label="Jumlah maksimal">
        <Input type="number" min={1} max={24} value={s.limit} onChange={(e) => set({ limit: clamp(e.target.value, 1, 24) })} />
      </Field>
      <Field label="Tampilan">
        <Segmented
          value={s.style}
          options={[
            ["list", "Daftar"],
            ["cards", "Kartu bergambar"],
          ]}
          onChange={(style) => set({ style })}
        />
      </Field>
    </>
  );
}

function FeaturesFields({ section: s, onChange }: { section: Of<"features">; onChange: (s: HomeSection) => void }) {
  const set = (patch: Partial<Of<"features">>) => onChange({ ...s, ...patch });
  return (
    <>
      <Field label="Judul">
        <Input value={s.title} onChange={(e) => set({ title: e.target.value })} maxLength={120} />
      </Field>
      <Field label="Subjudul">
        <Input value={s.subtitle} onChange={(e) => set({ subtitle: e.target.value })} maxLength={300} />
      </Field>
      <ColumnsField value={s.columns} onChange={(columns) => set({ columns })} />
      <Group title={`Kartu (${s.items.length}/12)`}>
        <Repeater
          items={s.items}
          onChange={(items) => set({ items })}
          max={12}
          newItem={() => ({ icon: "file", image: null, title: "Kartu baru", text: "", href: "" })}
          render={(item, update) => (
            <div className="space-y-2">
              <Input value={item.title} onChange={(e) => update({ ...item, title: e.target.value })} placeholder="Judul" maxLength={80} />
              <Textarea value={item.text} onChange={(e) => update({ ...item, text: e.target.value })} placeholder="Teks singkat" rows={2} maxLength={300} />
              <Input value={item.href} onChange={(e) => update({ ...item, href: e.target.value })} placeholder="Tautan (opsional), mis. /docs/…" list="docsku-links" />
              <div className="flex items-center gap-2">
                <IconSelect value={item.icon} onChange={(icon) => update({ ...item, icon })} />
                <ImageButton value={item.image} onChange={(image) => update({ ...item, image })} />
              </div>
            </div>
          )}
        />
      </Group>
    </>
  );
}

function TextImageFields({ section: s, onChange }: { section: Of<"textImage">; onChange: (s: HomeSection) => void }) {
  const set = (patch: Partial<Of<"textImage">>) => onChange({ ...s, ...patch });
  return (
    <>
      <Field label="Judul">
        <Input value={s.title} onChange={(e) => set({ title: e.target.value })} maxLength={160} />
      </Field>
      <Field label="Teks" hint="Baris kosong memisahkan paragraf.">
        <Textarea value={s.text} onChange={(e) => set({ text: e.target.value })} rows={6} maxLength={3000} />
      </Field>
      <ImageField label="Gambar" value={s.image} onChange={(image) => set({ image })} />
      {s.image && (
        <Field label="Posisi gambar">
          <Segmented
            value={s.imageSide}
            options={[
              ["left", "Kiri"],
              ["right", "Kanan"],
            ]}
            onChange={(imageSide) => set({ imageSide })}
          />
        </Field>
      )}
      <ButtonsField value={s.buttons} onChange={(buttons) => set({ buttons })} />
    </>
  );
}

function FaqFields({ section: s, onChange }: { section: Of<"faq">; onChange: (s: HomeSection) => void }) {
  const set = (patch: Partial<Of<"faq">>) => onChange({ ...s, ...patch });
  return (
    <>
      <Field label="Judul">
        <Input value={s.title} onChange={(e) => set({ title: e.target.value })} maxLength={120} />
      </Field>
      <Group title={`Pertanyaan (${s.items.length})`}>
        <Repeater
          items={s.items}
          onChange={(items) => set({ items })}
          max={30}
          newItem={() => ({ question: "Pertanyaan baru?", answer: "" })}
          render={(item, update) => (
            <div className="space-y-2">
              <Input value={item.question} onChange={(e) => update({ ...item, question: e.target.value })} placeholder="Pertanyaan" maxLength={200} />
              <Textarea value={item.answer} onChange={(e) => update({ ...item, answer: e.target.value })} placeholder="Jawaban" rows={3} maxLength={2000} />
            </div>
          )}
        />
      </Group>
    </>
  );
}

function StatsFields({ section: s, onChange }: { section: Of<"stats">; onChange: (s: HomeSection) => void }) {
  const set = (patch: Partial<Of<"stats">>) => onChange({ ...s, ...patch });
  return (
    <>
      <Field label="Judul (opsional)">
        <Input value={s.title} onChange={(e) => set({ title: e.target.value })} maxLength={120} />
      </Field>
      <Group title={`Angka (${s.items.length}/6)`}>
        <Repeater
          items={s.items}
          onChange={(items) => set({ items })}
          max={6}
          newItem={() => ({ value: "0", label: "Keterangan" })}
          render={(item, update) => (
            <div className="grid grid-cols-[6rem_1fr] gap-2">
              <Input value={item.value} onChange={(e) => update({ ...item, value: e.target.value })} placeholder="100+" maxLength={20} />
              <Input value={item.label} onChange={(e) => update({ ...item, label: e.target.value })} placeholder="Keterangan" maxLength={80} />
            </div>
          )}
        />
      </Group>
    </>
  );
}

function CtaFields({ section: s, onChange }: { section: Of<"cta">; onChange: (s: HomeSection) => void }) {
  const set = (patch: Partial<Of<"cta">>) => onChange({ ...s, ...patch });
  return (
    <>
      <Field label="Judul">
        <Input value={s.title} onChange={(e) => set({ title: e.target.value })} maxLength={160} />
      </Field>
      <Field label="Teks">
        <Textarea value={s.text} onChange={(e) => set({ text: e.target.value })} rows={2} maxLength={400} />
      </Field>
      <ButtonsField value={s.buttons} onChange={(buttons) => set({ buttons })} />
    </>
  );
}

// ---- Building blocks ----

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4 border-t border-line pt-4">
      <legend className="mb-3 text-[11px] font-semibold tracking-wide text-fg-subtle uppercase">{title}</legend>
      {children}
    </fieldset>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm text-fg">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-accent" />
      {label}
    </label>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1 rounded-lg bg-fill p-1">
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`flex-1 rounded-md px-2.5 py-1 text-xs transition-colors ${value === key ? "bg-surface font-medium text-fg shadow-sm" : "text-fg-muted hover:text-fg"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ColumnsField({ value, onChange }: { value: 2 | 3 | 4; onChange: (v: 2 | 3 | 4) => void }) {
  return (
    <Field label="Kolom (layar lebar)">
      <Segmented
        value={String(value) as "2" | "3" | "4"}
        options={[
          ["2", "2"],
          ["3", "3"],
          ["4", "4"],
        ]}
        onChange={(v) => onChange(Number(v) as 2 | 3 | 4)}
      />
    </Field>
  );
}

const clamp = (value: string, min: number, max: number) => Math.min(max, Math.max(min, Math.floor(Number(value) || 0)));

/** A list with reorder and remove; `newItem` adds an "add" button. */
function Repeater<T>({
  items,
  onChange,
  render,
  newItem,
  max = 30,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  render: (item: T, update: (next: T) => void) => React.ReactNode;
  newItem?: () => T;
  max?: number;
}) {
  const move = (from: number, to: number) => {
    const next = [...items];
    next.splice(to, 0, next.splice(from, 1)[0]);
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-2 rounded-lg border border-line bg-page p-2.5">
          <div className="min-w-0 flex-1">{render(item, (next) => onChange(items.map((it, j) => (j === i ? next : it))))}</div>
          <div className="flex shrink-0 flex-col gap-0.5">
            <IconButton label="Naikkan" disabled={i === 0} onClick={() => move(i, i - 1)}>
              <ArrowUp className="size-3.5" />
            </IconButton>
            <IconButton label="Turunkan" disabled={i === items.length - 1} onClick={() => move(i, i + 1)}>
              <ArrowDown className="size-3.5" />
            </IconButton>
            <IconButton label="Hapus" onClick={() => onChange(items.filter((_, j) => j !== i))}>
              <Trash2 className="size-3.5" />
            </IconButton>
          </div>
        </div>
      ))}
      {newItem && items.length < max && (
        <Button size="sm" variant="secondary" onClick={() => onChange([...items, newItem()])}>
          <Plus className="size-3.5" />
          Tambah
        </Button>
      )}
    </div>
  );
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex size-6 items-center justify-center rounded text-fg-subtle hover:bg-fill hover:text-fg disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function ButtonsField({ value, onChange }: { value: HomeButton[]; onChange: (v: HomeButton[]) => void }) {
  return (
    <Group title={`Tombol (${value.length}/3)`}>
      <Repeater
        items={value}
        onChange={onChange}
        max={3}
        newItem={(): HomeButton => ({ label: "Selengkapnya", href: "/docs", style: value.length ? "secondary" : "primary" })}
        render={(button, update) => (
          <div className="space-y-2">
            <Input value={button.label} onChange={(e) => update({ ...button, label: e.target.value })} placeholder="Teks tombol" maxLength={40} />
            <Input value={button.href} onChange={(e) => update({ ...button, href: e.target.value })} placeholder="/docs/… atau https://…" list="docsku-links" />
            <Segmented
              value={button.style}
              options={[
                ["primary", "Utama"],
                ["secondary", "Garis"],
              ]}
              onChange={(style) => update({ ...button, style })}
            />
          </div>
        )}
      />
    </Group>
  );
}

function IconSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-1 items-center gap-2">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
        <Icon name={value} className="size-4" />
      </span>
      <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Ikon" className="h-8 text-xs">
        {iconNames.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </Select>
    </label>
  );
}

/** Small "image instead of icon" button for repeated cards. */
function ImageButton({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const [picking, setPicking] = useState(false);
  return (
    <>
      {value ? (
        <span className="flex items-center gap-1">
          {/* eslint-disable-next-line @next/next/no-img-element -- uploads are served as-is from /media */}
          <img src={value} alt="" className="size-8 rounded border border-line object-cover" />
          <IconButton label="Hapus gambar" onClick={() => onChange(null)}>
            <Trash2 className="size-3.5" />
          </IconButton>
        </span>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setPicking(true)}>
          <ImagePlus className="size-3.5" />
          Gambar
        </Button>
      )}
      {picking && <ImageDialog onSelect={({ url }) => (onChange(url), setPicking(false))} onClose={() => setPicking(false)} />}
    </>
  );
}

function ImageField({ label, value, onChange, hint }: { label: string; value: string | null; onChange: (v: string | null) => void; hint?: string }) {
  const [picking, setPicking] = useState(false);
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-fg">{label}</span>
      {value && (
        // eslint-disable-next-line @next/next/no-img-element -- uploads are served as-is from /media
        <img src={value} alt="" className="mb-2 aspect-[2/1] w-full rounded-lg border border-line object-cover" />
      )}
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={() => setPicking(true)}>
          <ImagePlus className="size-3.5" />
          {value ? "Ganti" : "Pilih gambar"}
        </Button>
        {value && (
          <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
            <Trash2 className="size-3.5" />
            Hapus
          </Button>
        )}
      </div>
      {hint && <span className="mt-1 block text-xs text-fg-subtle">{hint}</span>}
      {picking && <ImageDialog onSelect={({ url }) => (onChange(url), setPicking(false))} onClose={() => setPicking(false)} />}
    </div>
  );
}
