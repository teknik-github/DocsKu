"use client";

import { useState, useTransition } from "react";
import { BookA, Pencil, Plus, Search, Trash2 } from "lucide-react";
import type { GlossarySettings, GlossaryTerm } from "@/lib/site-types";
import { deleteGlossaryTerm, saveGlossaryTerm, setGlossaryTooltips } from "@/app/admin/_actions/glossary";
import { Alert, Button, Field, Input, Panel, Textarea } from "@/components/admin/ui";
import { confirmDialog } from "@/components/admin/dialog";

type Draft = { id?: string; term: string; aliases: string; definition: string };

const EMPTY: Draft = { term: "", aliases: "", definition: "" };
const toDraft = (term: GlossaryTerm): Draft => ({ id: term.id, term: term.term, aliases: term.aliases.join(", "), definition: term.definition });
const splitAliases = (text: string) => text.split(",").map((alias) => alias.trim()).filter(Boolean);
const sortTerms = (terms: GlossaryTerm[]) => [...terms].sort((a, b) => a.term.localeCompare(b.term, "id", { sensitivity: "base" }));

/** Glossary terms: add, edit in place, delete, and the article-tooltip switch. */
export function GlossaryManager({ initial }: { initial: GlossarySettings }) {
  const [glossary, setGlossary] = useState(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const q = query.trim().toLocaleLowerCase("id");
  const shown = sortTerms(glossary.terms).filter(
    (term) => !q || [term.term, ...term.aliases, term.definition].some((text) => text.toLocaleLowerCase("id").includes(q)),
  );

  function save() {
    if (!draft) return;
    setError("");
    start(async () => {
      const result = await saveGlossaryTerm({ id: draft.id, term: draft.term, aliases: splitAliases(draft.aliases), definition: draft.definition });
      if (!result.ok) return setError(result.error);
      setGlossary(result.glossary);
      setDraft(null);
    });
  }

  async function remove(term: GlossaryTerm) {
    const ok = await confirmDialog({
      title: `Hapus “${term.term}”?`,
      message: "Istilah ini hilang dari halaman Glosarium dan tidak lagi diberi keterangan di artikel.",
      confirmLabel: "Hapus",
      tone: "danger",
    });
    if (!ok) return;
    start(async () => {
      const result = await deleteGlossaryTerm(term.id);
      if (!result.ok) return setError(result.error);
      setGlossary(result.glossary);
      if (draft?.id === term.id) setDraft(null);
    });
  }

  function toggleTooltips(tooltips: boolean) {
    // Shown at once; put back if saving fails.
    const previous = glossary;
    setGlossary({ ...glossary, tooltips });
    start(async () => {
      const result = await setGlossaryTooltips(tooltips);
      if (!result.ok) {
        setGlossary(previous);
        return setError(result.error);
      }
      setGlossary(result.glossary);
    });
  }

  const form = draft && (
    <div className="space-y-3 border-b border-line bg-fill/40 px-5 py-4" data-testid="glossary-form">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Istilah">
          <Input autoFocus value={draft.term} maxLength={60} onChange={(e) => setDraft({ ...draft, term: e.target.value })} placeholder="Container" />
        </Field>
        <Field label="Sebutan lain" hint="Pisahkan dengan koma. Juga diberi keterangan di artikel.">
          <Input value={draft.aliases} onChange={(e) => setDraft({ ...draft, aliases: e.target.value })} placeholder="kontainer, wadah" />
        </Field>
      </div>
      <Field label="Definisi" hint={`${draft.definition.length}/400 · teks biasa, satu atau dua kalimat`}>
        <Textarea
          value={draft.definition}
          maxLength={400}
          rows={3}
          onChange={(e) => setDraft({ ...draft, definition: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save();
            if (e.key === "Escape") setDraft(null);
          }}
          placeholder="Paket ringan berisi aplikasi beserta semua yang dibutuhkannya untuk berjalan."
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setDraft(null)} disabled={pending}>
          Batal
        </Button>
        <Button variant="accent" onClick={save} disabled={pending || draft.term.trim().length < 2 || draft.definition.trim().length < 3}>
          {draft.id ? "Simpan perubahan" : "Tambah istilah"}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {error && <Alert>{error}</Alert>}
      <Panel className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <p className="text-sm font-medium text-fg">Keterangan di artikel</p>
          <p className="text-xs text-fg-subtle">Penggunaan pertama tiap istilah di artikel diberi garis titik-titik; arahkan kursor atau ketuk untuk melihat artinya.</p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-fg">
          <input
            type="checkbox"
            className="size-4 accent-(--accent)"
            checked={glossary.tooltips}
            disabled={pending}
            onChange={(e) => toggleTooltips(e.target.checked)}
          />
          Aktif
        </label>
      </Panel>

      <Panel>
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
          <div className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari istilah…" className="pl-9" aria-label="Cari istilah" />
          </div>
          <span className="text-xs text-fg-subtle tabular-nums">{glossary.terms.length} istilah</span>
          <Button variant="accent" onClick={() => setDraft({ ...EMPTY })} disabled={pending || (draft !== null && !draft.id)}>
            <Plus className="size-4" />
            Istilah baru
          </Button>
        </div>
        {draft && !draft.id && form}
        {glossary.terms.length === 0 && !draft ? (
          <div className="px-5 py-14 text-center">
            <BookA className="mx-auto size-8 text-fg-subtle" />
            <p className="mt-3 text-sm text-fg">Glosarium masih kosong.</p>
            <p className="mt-1 text-xs text-fg-subtle">Tambahkan istilah yang sering muncul di dokumentasi, misalnya “container” atau “API key”.</p>
          </div>
        ) : shown.length === 0 && glossary.terms.length > 0 ? (
          <p className="px-5 py-10 text-center text-sm text-fg-subtle">Tidak ada istilah yang cocok dengan “{query}”.</p>
        ) : (
          <ul className="divide-y divide-line">
            {shown.map((term) =>
              draft?.id === term.id ? (
                <li key={term.id}>{form}</li>
              ) : (
                <li key={term.id} className="group flex items-start gap-3 px-5 py-3" data-testid="glossary-row">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-fg">
                      {term.term}
                      {term.aliases.length > 0 && <span className="ml-2 text-xs font-normal text-fg-subtle">{term.aliases.join(", ")}</span>}
                    </p>
                    <p className="mt-0.5 text-sm text-fg-muted">{term.definition}</p>
                  </div>
                  <div className="flex shrink-0 gap-1 opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                    <Button variant="ghost" size="sm" aria-label={`Ubah ${term.term}`} onClick={() => setDraft(toDraft(term))} disabled={pending}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" aria-label={`Hapus ${term.term}`} onClick={() => remove(term)} disabled={pending}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </li>
              ),
            )}
          </ul>
        )}
      </Panel>
    </div>
  );
}
