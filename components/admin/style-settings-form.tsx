"use client";

import { useState, useTransition } from "react";
import { PenLine } from "lucide-react";
import { saveWritingStyle } from "@/app/admin/_actions/style";
import type { WritingStyle } from "@/lib/ai/style";
import { Alert, Button, Field, Input, Panel, Textarea } from "@/components/admin/ui";

/** Pengaturan → Gaya penulisan: voice, house rules, words to avoid, glossary as standard terms. */
export function StyleSettingsForm({ initial, glossaryTerms }: { initial: WritingStyle; glossaryTerms: number }) {
  const [form, setForm] = useState({ ...initial, avoidText: initial.avoid.join(", ") });
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setMessage(null);
    start(async () => {
      const avoid = form.avoidText
        .split(/[,\n]/)
        .map((word) => word.trim())
        .filter(Boolean);
      const result = await saveWritingStyle({ voice: form.voice, rules: form.rules, avoid, useGlossary: form.useGlossary });
      setMessage(result.ok ? { tone: "success", text: "Gaya penulisan disimpan. AI Chat dan AI Write memakainya mulai pesan berikutnya." } : { tone: "error", text: result.error });
    });
  }

  return (
    <Panel className="max-w-3xl space-y-5 p-5" data-testid="style-form">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <PenLine className="size-4 text-accent" />
          Gaya penulisan
        </h2>
        <p className="mt-1 text-xs text-fg-subtle">
          Aturan yang selalu diikuti AI Chat dan AI Write, agar semua tulisan terdengar seperti satu tim. Kata yang dihindari juga ditandai di panel Periksa editor.
        </p>
      </div>
      <Field label="Nada tulisan" hint="Satu atau dua kalimat, mis. “Ramah dan lugas, sapa pembaca dengan Anda, hindari bahasa marketing.”">
        <Input value={form.voice} maxLength={600} onChange={(e) => setForm({ ...form, voice: e.target.value })} placeholder="Ramah dan lugas, sapa pembaca dengan Anda" />
      </Field>
      <Field label="Aturan tim" hint="Satu aturan per baris.">
        <Textarea
          rows={5}
          value={form.rules}
          maxLength={2000}
          onChange={(e) => setForm({ ...form, rules: e.target.value })}
          placeholder={"Tulis angka dengan titik ribuan (1.000)\nNama produk selalu “Docsku”, bukan “DocsKu”\nPerintah terminal selalu dalam blok kode bash"}
        />
      </Field>
      <Field label="Kata yang dihindari" hint="Pisahkan dengan koma.">
        <Input value={form.avoidText} onChange={(e) => setForm({ ...form, avoidText: e.target.value })} placeholder="gampang, cukup, tinggal, simpel" />
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={form.useGlossary} onChange={(e) => setForm({ ...form, useGlossary: e.target.checked })} className="mt-0.5 accent-accent" />
        <span>
          Pakai glosarium sebagai istilah baku
          <span className="block text-xs text-fg-subtle">
            {glossaryTerms ? `${glossaryTerms} istilah dari Glosarium ikut dikirim ke AI.` : "Glosarium masih kosong; tambahkan istilah di menu Glosarium."}
          </span>
        </span>
      </label>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <Button size="sm" onClick={save} disabled={pending}>
        Simpan
      </Button>
    </Panel>
  );
}
