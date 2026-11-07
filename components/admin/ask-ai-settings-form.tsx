"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { saveAskAiSettings } from "@/app/admin/_actions/ai";
import { Alert, Button, Field, Input, Panel } from "@/components/admin/ui";
import type { AskAiSettings } from "@/lib/site-types";

/** Pengaturan → Tanya AI: answers from the docs in the public search box, and their limits. */
export function AskAiSettingsForm({ initial, aiReady, askedToday }: { initial: AskAiSettings; aiReady: boolean; askedToday: number }) {
  const [form, setForm] = useState(initial);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await saveAskAiSettings(form);
      setMessage(result.ok ? { tone: "success", text: "Pengaturan Tanya AI disimpan." } : { tone: "error", text: result.error });
    });
  }

  const number = (value: string) => Math.max(0, Math.floor(Number(value) || 0));

  return (
    <Panel className="max-w-3xl space-y-5 p-5">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="size-4 text-accent" />
          Tanya AI di pencarian
        </h2>
        <p className="mt-1 text-xs text-fg-subtle">
          Pengunjung bisa bertanya di kotak pencarian dan mendapat jawaban yang disusun AI hanya dari artikel yang sudah terbit, lengkap dengan
          tautan sumbernya. Setiap pertanyaan memakai kuota API AI Anda; jawaban untuk pertanyaan yang sama disimpan selama 1 jam.
        </p>
      </div>

      {!aiReady && <Alert>AI belum siap. Aktifkan dan isi API key di bagian AI di atas; sebelum itu Tanya AI tidak tampil.</Alert>}

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="mt-0.5 accent-accent" />
        <span>
          Tampilkan Tanya AI
          <span className="block text-xs text-fg-subtle">Baris &quot;Tanya AI&quot; muncul di atas hasil pencarian.</span>
        </span>
      </label>

      <div className={`grid gap-4 sm:grid-cols-2 ${form.enabled ? "" : "opacity-50"}`}>
        <Field label="Per pengunjung per menit" hint="Dihitung per IP, hanya di balik proxy tepercaya (TRUST_PROXY).">
          <Input
            type="number"
            min={1}
            max={60}
            value={form.perMinute}
            disabled={!form.enabled}
            onChange={(e) => setForm({ ...form, perMinute: number(e.target.value) })}
          />
        </Field>
        <Field label="Per hari untuk seluruh situs" hint={`Hari ini sudah ${askedToday.toLocaleString("id-ID")} pertanyaan. Setelah habis, pencarian kembali biasa.`}>
          <Input
            type="number"
            min={1}
            value={form.dailyLimit}
            disabled={!form.enabled}
            onChange={(e) => setForm({ ...form, dailyLimit: number(e.target.value) })}
          />
        </Field>
      </div>

      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <Button size="sm" onClick={save} disabled={pending}>
        Simpan
      </Button>
    </Panel>
  );
}
