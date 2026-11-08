"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronRight, History, ShieldCheck } from "lucide-react";
import { saveSecuritySettings } from "@/app/admin/_actions/two-factor";
import { Alert, Button, Panel } from "@/components/admin/ui";
import type { SecuritySettings } from "@/lib/data/security";

/** Pengaturan → Keamanan: require 2FA for admins, plus who already uses it and a link to the activity log. */
export function SecuritySettingsForm({
  initial,
  admins,
  ownEnabled,
}: {
  initial: SecuritySettings;
  admins: { total: number; withTwoFactor: number };
  ownEnabled: boolean;
}) {
  const [form, setForm] = useState(initial);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await saveSecuritySettings(form);
      setMessage(result.ok ? { tone: "success", text: "Pengaturan keamanan disimpan." } : { tone: "error", text: result.error });
    });
  }

  const missing = admins.total - admins.withTwoFactor;
  return (
    <Panel className="max-w-3xl divide-y divide-line">
      <div className="space-y-5 p-5">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="size-4 text-accent" />
            Keamanan
          </h2>
          <p className="mt-1 text-xs text-fg-subtle">
            {admins.withTwoFactor} dari {admins.total} admin memakai verifikasi dua langkah.
            {missing > 0 && " Admin bisa melakukan apa saja di situs ini, jadi akun mereka paling perlu dilindungi."}
          </p>
        </div>
        <label className={`flex items-start gap-2 text-sm ${!ownEnabled && !form.requireAdmin2fa ? "opacity-60" : ""}`}>
          <input
            type="checkbox"
            checked={form.requireAdmin2fa}
            disabled={!ownEnabled && !form.requireAdmin2fa}
            onChange={(e) => setForm({ ...form, requireAdmin2fa: e.target.checked })}
            className="mt-0.5 accent-accent"
          />
          <span>
            Wajibkan verifikasi dua langkah untuk admin
            <span className="block text-xs text-fg-subtle">
              Admin yang belum memakainya diarahkan ke Profil setelah masuk dan melihat pengingat di setiap halaman sampai mengaktifkannya. Editor tidak terpengaruh.
            </span>
            {!ownEnabled && (
              <span className="mt-1 block text-xs text-amber-700 dark:text-amber-300">
                Aktifkan dulu di{" "}
                <Link href="/admin/profile#2fa" className="underline">
                  Profil Anda
                </Link>
                .
              </span>
            )}
          </span>
        </label>
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        <Button size="sm" onClick={save} disabled={pending}>
          Simpan
        </Button>
      </div>
      <Link href="/admin/activity" className="group flex items-center gap-3 p-5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <History className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-fg group-hover:text-accent">Log aktivitas</span>
          <span className="block text-xs text-fg-subtle">Siapa masuk, menerbitkan, menghapus, atau mengubah pengaturan, dan kapan.</span>
        </span>
        <ChevronRight className="size-4 text-fg-subtle" />
      </Link>
    </Panel>
  );
}
