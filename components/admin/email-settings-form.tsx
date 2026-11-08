"use client";

import { useState, useTransition } from "react";
import { Mail } from "lucide-react";
import { saveEmailSettings, sendTestEmail } from "@/app/admin/_actions/notifications";
import { Alert, Button, Field, Input, Panel, Select } from "@/components/admin/ui";
import type { EmailSettingsView } from "@/lib/notifications/settings";

type Stats = { pending: number; sent: number; failed: number; lastError: string | null };

const PORTS = { tls: 465, starttls: 587, none: 25 } as const;

/** Pengaturan → Email: the SMTP server used for notifications. The stored password is never sent back. */
export function EmailSettingsForm({ initial, stats, siteUrlSet, canEncrypt }: { initial: EmailSettingsView; stats: Stats; siteUrlSet: boolean; canEncrypt: boolean }) {
  const [form, setForm] = useState(initial);
  const [password, setPassword] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof EmailSettingsView>(key: K, value: EmailSettingsView[K]) => setForm((f) => ({ ...f, [key]: value }));

  function save() {
    setMessage(null);
    startTransition(async () => {
      const { hasPassword, ...rest } = form;
      void hasPassword;
      const result = await saveEmailSettings({ ...rest, password });
      if (!result.ok) return setMessage({ tone: "error", text: result.error });
      setForm(result.value);
      setPassword(null);
      setMessage({ tone: "success", text: "Pengaturan email disimpan." });
    });
  }

  function test() {
    setMessage(null);
    startTransition(async () => {
      const result = await sendTestEmail();
      setMessage(result.ok ? { tone: "success", text: `Email uji dikirim ke ${result.value}. Periksa kotak masuk (dan folder spam).` } : { tone: "error", text: result.error });
    });
  }

  return (
    <Panel className="max-w-3xl divide-y divide-line">
      <div className="space-y-5 p-5">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <Mail className="size-4 text-accent" />
            Email
          </h2>
          <p className="mt-1 text-xs text-fg-subtle">
            Server SMTP untuk notifikasi: komentar baru, pesan pembaca, pengajuan tinjauan, dan ringkasan mingguan. Tiap orang memilih notifikasinya di Profil.
          </p>
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} className="mt-0.5 accent-accent" />
          <span>
            Kirim notifikasi lewat email
            <span className="block text-xs text-fg-subtle">Saat mati, tidak ada email yang diantrekan.</span>
          </span>
        </label>

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem_10rem]">
          <Field label="Host SMTP">
            <Input value={form.host} onChange={(e) => set("host", e.target.value)} placeholder="smtp.contoh.com" autoComplete="off" spellCheck={false} />
          </Field>
          <Field label="Port">
            <Input type="number" min={1} max={65535} value={form.port} onChange={(e) => set("port", Number(e.target.value) || 0)} />
          </Field>
          <Field label="Keamanan">
            <Select
              value={form.security}
              onChange={(e) => {
                const security = e.target.value as EmailSettingsView["security"];
                setForm((f) => ({ ...f, security, port: Object.values(PORTS).includes(f.port as 465) ? PORTS[security] : f.port }));
              }}
            >
              <option value="starttls">STARTTLS</option>
              <option value="tls">TLS/SSL</option>
              <option value="none">Tanpa enkripsi</option>
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nama pengguna" hint="Kosongkan jika server tidak butuh login.">
            <Input value={form.user} onChange={(e) => set("user", e.target.value)} autoComplete="off" spellCheck={false} />
          </Field>
          <Field
            label="Password"
            hint={
              !canEncrypt
                ? "ENCRYPTION_KEY belum diatur, jadi password tidak bisa disimpan."
                : form.hasPassword && password === null
                  ? "Tersimpan. Ketik untuk mengganti."
                  : "Disimpan terenkripsi, tidak pernah ditampilkan lagi."
            }
          >
            <div className="flex gap-2">
              <Input
                type="password"
                value={password ?? ""}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={form.hasPassword ? "••••••••" : ""}
                autoComplete="new-password"
                disabled={!canEncrypt}
              />
              {form.hasPassword && password !== "" && (
                <Button variant="ghost" size="sm" className="h-9" onClick={() => setPassword("")} title="Hapus password tersimpan">
                  Hapus
                </Button>
              )}
            </div>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nama pengirim">
            <Input value={form.fromName} onChange={(e) => set("fromName", e.target.value)} placeholder="Tim Dokumentasi" />
          </Field>
          <Field label="Alamat pengirim">
            <Input type="email" value={form.fromAddress} onChange={(e) => set("fromAddress", e.target.value)} placeholder="docs@contoh.com" />
          </Field>
        </div>

        {!siteUrlSet && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            SITE_URL belum diatur di server. Tautan di email memakai alamat yang Anda pakai untuk membuka dasbor ini; atur SITE_URL agar selalu benar.
          </p>
        )}

        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={save} disabled={pending}>
            Simpan
          </Button>
          <Button variant="secondary" size="sm" onClick={test} disabled={pending || !form.host}>
            Kirim email uji
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 px-5 py-3 text-xs text-fg-subtle">
        <span>
          Antrean: <strong className="font-medium text-fg">{stats.pending}</strong>
        </span>
        <span>
          Terkirim 7 hari: <strong className="font-medium text-fg">{stats.sent}</strong>
        </span>
        <span>
          Gagal 7 hari: <strong className={`font-medium ${stats.failed ? "text-red-600 dark:text-red-400" : "text-fg"}`}>{stats.failed}</strong>
        </span>
        {stats.lastError && <span className="min-w-0 basis-full truncate" title={stats.lastError}>Galat terakhir: {stats.lastError}</span>}
      </div>
    </Panel>
  );
}
