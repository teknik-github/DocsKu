"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ArrowLeft, Copy, ExternalLink, Eye, EyeOff, GripVertical, Monitor, Plus, Smartphone, Trash2, Undo2, X } from "lucide-react";
import { discardHomeDraft, publishHome, saveHomeDraft } from "@/app/admin/_actions/home";
import { Alert, Button, buttonClass } from "@/components/admin/ui";
import { Icon } from "@/components/icon";
import { SectionForm, type LinkOption } from "@/components/admin/home-section-form";
import { SECTION_TYPES, defaultSections, newSection, sectionId, sectionLabel } from "@/lib/home-sections";
import type { HomeSection, HomeSectionType } from "@/lib/site-types";
import { confirmDialog } from "@/components/admin/dialog";

type Save = { state: "idle" | "saving" | "saved" | "error"; at?: string; error?: string };

const typeIcon = (type: HomeSectionType) => SECTION_TYPES.find((t) => t.type === type)?.icon ?? "file";

/** A short line under each section in the list. */
function summary(section: HomeSection) {
  switch (section.type) {
    case "content":
      return section.markdown.replace(/[#*_`<>]/g, "").trim().split("\n")[0] || "Konten bebas";
    case "categories":
      return section.title || "Kategori otomatis";
    default:
      return section.title || sectionLabel(section.type);
  }
}

/**
 * The home page builder: sections on the left (drag to reorder, click to edit),
 * the real page on the right. Every change autosaves the draft and reloads the
 * preview; "Terbitkan" makes it live.
 */
export function HomeBuilder({
  initial,
  hasDraft: initialHasDraft,
  published,
  legacyHome,
  pages,
}: {
  initial: HomeSection[];
  hasDraft: boolean;
  /** The live sections, for "Buang perubahan" (null: never published). */
  published: HomeSection[] | null;
  /** An old block-edited home is live until this builder is published. */
  legacyHome: boolean;
  pages: LinkOption[];
}) {
  const [sections, setSections] = useState(initial);
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [hasDraft, setHasDraft] = useState(initialHasDraft);
  const [save, setSave] = useState<Save>({ state: "idle" });
  const [notice, setNotice] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [publishing, startPublish] = useTransition();
  const [dragging, setDragging] = useState<number | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const changed = useRef(false);
  const selectedRef = useRef(selected);

  const current = sections.find((s) => s.id === selected) ?? null;

  const tellFrame = useCallback((id: string | null) => {
    frame.current?.contentWindow?.postMessage({ type: "docsku:select", id }, window.location.origin);
  }, []);

  useEffect(() => {
    selectedRef.current = selected;
    tellFrame(selected);
  }, [selected, tellFrame]);

  // Clicks in the preview select a section; a reloaded preview asks for the current one.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === "docsku:select" && typeof event.data.id === "string") {
        setAdding(false);
        setSelected(event.data.id);
      }
      if (event.data?.type === "docsku:ready") tellFrame(selectedRef.current);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [tellFrame]);

  // Autosave the draft shortly after the last change, then refresh the preview.
  useEffect(() => {
    if (!changed.current) return;
    setSave({ state: "saving" });
    const timer = setTimeout(async () => {
      const result = await saveHomeDraft(sections);
      if (!result.ok) return setSave({ state: "error", error: result.error });
      setHasDraft(true);
      setSave({ state: "saved", at: result.savedAt });
      frame.current?.contentWindow?.location.reload();
    }, 700);
    return () => clearTimeout(timer);
  }, [sections]);

  function update(next: HomeSection[]) {
    changed.current = true;
    setNotice(null);
    setSections(next);
  }

  const patch = (id: string, next: HomeSection) => update(sections.map((s) => (s.id === id ? next : s)));

  function add(type: HomeSectionType) {
    const section = newSection(type);
    const at = current ? sections.indexOf(current) + 1 : sections.length;
    update([...sections.slice(0, at), section, ...sections.slice(at)]);
    setAdding(false);
    setSelected(section.id);
  }

  function duplicate(section: HomeSection) {
    const copy = { ...structuredClone(section), id: sectionId() };
    const at = sections.indexOf(section) + 1;
    update([...sections.slice(0, at), copy, ...sections.slice(at)]);
    setSelected(copy.id);
  }

  async function remove(section: HomeSection) {
    const ok = await confirmDialog({
      title: `Hapus bagian “${summary(section)}”?`,
      message: "Bagian dihapus dari draf beranda. Situs baru berubah setelah Anda menerbitkan.",
      confirmLabel: "Hapus bagian",
      tone: "danger",
    });
    if (!ok) return;
    update(sections.filter((s) => s.id !== section.id));
    if (selected === section.id) setSelected(null);
  }

  function move(from: number, to: number) {
    if (from === to || to < 0 || to >= sections.length) return;
    const next = [...sections];
    next.splice(to, 0, next.splice(from, 1)[0]);
    update(next);
  }

  function publish() {
    setNotice(null);
    startPublish(async () => {
      const result = await publishHome(sections);
      if (!result.ok) return setNotice({ tone: "error", text: result.error });
      setHasDraft(false);
      setNotice({ tone: "success", text: "Beranda diterbitkan. Pengunjung sekarang melihat susunan ini." });
    });
  }

  async function discard() {
    const ok = await confirmDialog({
      title: "Buang semua perubahan?",
      message: "Draf beranda kembali sama dengan yang tampil di situs.",
      confirmLabel: "Buang perubahan",
      tone: "danger",
    });
    if (!ok) return;
    startPublish(async () => {
      const result = await discardHomeDraft();
      if (!result.ok) return setNotice({ tone: "error", text: result.error });
      changed.current = false;
      setSections(published ?? defaultSections());
      setSelected(null);
      setHasDraft(false);
      setSave({ state: "idle" });
      frame.current?.contentWindow?.location.reload();
    });
  }

  const status =
    save.state === "saving"
      ? "Menyimpan draf…"
      : save.state === "error"
        ? "Draf belum tersimpan"
        : hasDraft
          ? "Ada perubahan yang belum diterbitkan"
          : "Sama dengan yang tampil di situs";

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-semibold text-fg">Beranda</h1>
          <p className={`truncate text-xs ${save.state === "error" ? "text-red-600 dark:text-red-400" : "text-fg-subtle"}`}>{status}</p>
        </div>
        <div className="hidden gap-1 rounded-lg bg-fill p-1 lg:flex" aria-label="Ukuran pratinjau">
          {(
            [
              ["desktop", Monitor, "Desktop"],
              ["mobile", Smartphone, "Ponsel"],
            ] as const
          ).map(([key, DeviceIcon, label]) => (
            <button
              key={key}
              type="button"
              aria-label={label}
              title={label}
              onClick={() => setDevice(key)}
              className={`rounded-md px-2 py-1 ${device === key ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg"}`}
            >
              <DeviceIcon className="size-4" />
            </button>
          ))}
        </div>
        <a href="/preview/beranda" target="_blank" rel="noreferrer" className={buttonClass("ghost", "sm")}>
          <ExternalLink className="size-3.5" />
          Pratinjau
        </a>
        {hasDraft && (
          <Button size="sm" variant="ghost" onClick={discard} disabled={publishing}>
            <Undo2 className="size-3.5" />
            Buang perubahan
          </Button>
        )}
        <Button size="sm" variant="accent" onClick={publish} disabled={publishing || save.state === "saving" || (!hasDraft && !legacyHome && published !== null)}>
          {publishing ? "Menerbitkan…" : "Terbitkan"}
        </Button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Sections and the selected section's form */}
        <aside className="flex w-full shrink-0 flex-col overflow-y-auto border-r border-line bg-surface lg:w-[380px]">
          {(notice || save.error || legacyHome) && (
            <div className="space-y-2 p-4 pb-0">
              {legacyHome && <Alert>Beranda saat ini masih memakai halaman blok lama. Terbitkan susunan ini untuk menggantinya.</Alert>}
              {save.state === "error" && save.error && <Alert>{save.error}</Alert>}
              {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
            </div>
          )}

          {current ? (
            <div className="p-4">
              <button type="button" onClick={() => setSelected(null)} className="mb-4 flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg">
                <ArrowLeft className="size-3.5" />
                Semua bagian
              </button>
              <div className="mb-5 flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-lg bg-accent-soft text-accent">
                  <Icon name={typeIcon(current.type)} className="size-4" />
                </span>
                <h2 className="text-sm font-semibold text-fg">{sectionLabel(current.type)}</h2>
              </div>
              <SectionForm key={current.id} section={current} onChange={(next) => patch(current.id, next)} pages={pages} />
            </div>
          ) : adding ? (
            <div className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-fg">Tambah bagian</h2>
                <button type="button" onClick={() => setAdding(false)} aria-label="Tutup" className="text-fg-subtle hover:text-fg">
                  <X className="size-4" />
                </button>
              </div>
              <div className="grid gap-2">
                {SECTION_TYPES.map((t) => (
                  <button
                    key={t.type}
                    type="button"
                    onClick={() => add(t.type)}
                    className="flex items-start gap-3 rounded-lg border border-line p-3 text-left transition-colors hover:border-accent hover:bg-accent-soft/30"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                      <Icon name={t.icon} className="size-4" />
                    </span>
                    <span>
                      <span className="block text-sm font-medium text-fg">{t.label}</span>
                      <span className="block text-xs text-fg-muted">{t.description}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-4">
              <p className="mb-3 text-xs text-fg-subtle">Klik bagian untuk mengubahnya, seret untuk mengurutkan. Bisa juga klik langsung di pratinjau.</p>
              <ol className="space-y-1.5">
                {sections.map((section, i) => (
                  <li
                    key={section.id}
                    draggable
                    onDragStart={() => setDragging(i)}
                    onDragEnd={() => setDragging(null)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => dragging !== null && (move(dragging, i), setDragging(null))}
                    className={`group flex items-center gap-2 rounded-lg border bg-page px-2 py-2 transition-colors ${
                      dragging === i ? "opacity-50" : ""
                    } ${section.hidden ? "border-dashed border-line" : "border-line hover:border-line-strong"}`}
                  >
                    <GripVertical className="size-4 shrink-0 cursor-grab text-fg-subtle" aria-hidden />
                    <button type="button" onClick={() => setSelected(section.id)} className={`flex min-w-0 flex-1 items-center gap-2.5 text-left ${section.hidden ? "opacity-50" : ""}`}>
                      <Icon name={typeIcon(section.type)} className="size-4 shrink-0 text-accent" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-fg">{sectionLabel(section.type)}</span>
                        <span className="block truncate text-xs text-fg-subtle">
                          {summary(section)}
                          {section.width === "half" && section.type !== "hero" ? " · setengah" : ""}
                        </span>
                      </span>
                    </button>
                    <span className="flex shrink-0 items-center opacity-60 group-hover:opacity-100">
                      <ListButton label={section.hidden ? "Tampilkan" : "Sembunyikan"} onClick={() => patch(section.id, { ...section, hidden: !section.hidden })}>
                        {section.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                      </ListButton>
                      <ListButton label="Duplikat" onClick={() => duplicate(section)}>
                        <Copy className="size-3.5" />
                      </ListButton>
                      <ListButton label="Hapus" onClick={() => remove(section)}>
                        <Trash2 className="size-3.5" />
                      </ListButton>
                    </span>
                  </li>
                ))}
              </ol>
              {sections.length === 0 && <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-sm text-fg-subtle">Belum ada bagian.</p>}
            </div>
          )}

          {!adding && (
            <div className="sticky bottom-0 mt-auto border-t border-line bg-surface p-4">
              <Button variant="secondary" className="w-full" onClick={() => (setAdding(true), setSelected(null))} disabled={sections.length >= 30}>
                <Plus className="size-4" />
                Tambah bagian
              </Button>
            </div>
          )}
        </aside>

        {/* Live preview of the draft */}
        <div className="hidden min-w-0 flex-1 justify-center overflow-hidden bg-fill p-4 lg:flex">
          <iframe
            ref={frame}
            src="/preview/beranda"
            title="Pratinjau beranda"
            className={`h-full rounded-xl border border-line bg-page shadow-sm transition-[width] ${device === "mobile" ? "w-[390px]" : "w-full"}`}
          />
        </div>
      </div>
    </div>
  );
}

function ListButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="inline-flex size-7 items-center justify-center rounded-md text-fg-subtle hover:bg-fill hover:text-fg"
    >
      {children}
    </button>
  );
}
