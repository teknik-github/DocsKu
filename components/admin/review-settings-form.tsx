"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { saveReviewSettings } from "@/app/admin/_actions/review";
import { Alert, Button, Panel, Select } from "@/components/admin/ui";
import type { ReviewSettings } from "@/lib/site-types";

const CHOICES = [30, 60, 90, 180, 365];

/** Pengaturan → Tinjauan konten: whether published pages come up for review, and after how long by default. */
export function ReviewSettingsForm({ initial, overdue }: { initial: ReviewSettings; overdue: number }) {
  const [form, setForm] = useState(initial);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const choices = CHOICES.includes(form.defaultIntervalDays) || form.defaultIntervalDays === 0 ? CHOICES : [...CHOICES, form.defaultIntervalDays].sort((a, b) => a - b);

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await saveReviewSettings(form);
      setMessage(result.ok ? { tone: "success", text: "Pengaturan tinjauan disimpan." } : { tone: "error", text: result.error });
    });
  }

  return (
    <Panel className="max-w-3xl space-y-5 p-5">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <CalendarClock className="size-4 text-accent" />
          Tinjauan konten
        </h2>
        <p className="mt-1 text-xs text-fg-subtle">
          Halaman yang sudah terbit perlu dicek ulang secara berkala agar isinya tetap benar. Halaman yang jatuh tempo muncul di{" "}
          <Link href="/admin/review" className="text-accent hover:underline">
            Tinjauan
          </Link>
          {overdue > 0 && ` (${overdue} sekarang)`} dan di Dasbor. Menerbitkan ulang juga dihitung sebagai tinjauan. Setiap halaman bisa punya penanggung jawab dan jadwal sendiri di pengaturan editornya.
        </p>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="mt-0.5 accent-accent" />
        <span>
          Ingatkan tinjauan berkala
          <span className="block text-xs text-fg-subtle">Jika mati, tidak ada halaman yang dianggap jatuh tempo.</span>
        </span>
      </label>
      <div className={`max-w-xs space-y-1 ${form.enabled ? "" : "opacity-50"}`}>
        <label htmlFor="review-default" className="text-sm">
          Jadwal bawaan
        </label>
        <Select
          id="review-default"
          value={String(form.defaultIntervalDays)}
          disabled={!form.enabled}
          onChange={(e) => setForm({ ...form, defaultIntervalDays: Number(e.target.value) })}
          className="text-sm"
        >
          {choices.map((d) => (
            <option key={d} value={d}>
              Setiap {d} hari
            </option>
          ))}
          <option value="0">Hanya halaman dengan jadwal sendiri</option>
        </Select>
        <p className="text-xs text-fg-subtle">Dihitung dari tinjauan atau penerbitan terakhir.</p>
      </div>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <Button size="sm" onClick={save} disabled={pending}>
        Simpan
      </Button>
    </Panel>
  );
}
