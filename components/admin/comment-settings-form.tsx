"use client";

import { useState, useTransition } from "react";
import { MessageSquare } from "lucide-react";
import { saveCommentSettings } from "@/app/admin/_actions/comments";
import { Alert, Button, Panel } from "@/components/admin/ui";
import type { CommentSettings } from "@/lib/site-types";

/** Pengaturan → Komentar: whether docs pages take public comments, and whether they wait for approval. */
export function CommentSettingsForm({ initial }: { initial: CommentSettings }) {
  const [form, setForm] = useState(initial);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await saveCommentSettings(form);
      setMessage(result.ok ? { tone: "success", text: "Pengaturan komentar disimpan." } : { tone: "error", text: result.error });
    });
  }

  const options: { key: keyof CommentSettings; label: string; description: string }[] = [
    { key: "enabled", label: "Komentar pembaca", description: "Tampilkan bagian komentar di bawah setiap halaman dokumentasi dan terima komentar baru." },
    {
      key: "moderation",
      label: "Moderasi manual",
      description:
        "Komentar baru menunggu persetujuan di menu Komentar sebelum tampil. Jika mati, komentar langsung tampil; komentar berisi tautan tetap ditinjau dulu, dan komentar yang tidak pantas bisa disembunyikan, ditandai spam, atau dihapus.",
    },
  ];

  return (
    <Panel className="max-w-3xl space-y-5 p-5">
      <div id="komentar" className="scroll-mt-20">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <MessageSquare className="size-4 text-accent" />
          Komentar
        </h2>
        <p className="mt-1 text-xs text-fg-subtle">Pembaca bisa bertanya atau menambahkan sesuatu di bawah halaman. Email pengirim hanya terlihat di dasbor. Tim yang sedang masuk berkomentar dengan nama akunnya dan label Tim.</p>
      </div>
      <div className="space-y-3">
        {options.map((option) => (
          <label key={option.key} className={`flex items-start gap-2 text-sm ${option.key === "moderation" && !form.enabled ? "opacity-50" : ""}`}>
            <input
              type="checkbox"
              checked={form[option.key]}
              disabled={option.key === "moderation" && !form.enabled}
              onChange={(e) => setForm({ ...form, [option.key]: e.target.checked })}
              className="mt-0.5 accent-accent"
            />
            <span>
              {option.label}
              <span className="block text-xs text-fg-subtle">{option.description}</span>
            </span>
          </label>
        ))}
      </div>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <Button size="sm" onClick={save} disabled={pending}>
        Simpan
      </Button>
    </Panel>
  );
}
