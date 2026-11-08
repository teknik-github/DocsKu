"use client";

import { useState, useTransition } from "react";
import { saveNotificationPrefs } from "@/app/admin/_actions/notifications";
import { Alert, Button } from "@/components/admin/ui";
import { EMAIL_EVENTS, prefOn } from "@/lib/notifications/catalog";
import type { Role } from "@/db/schema";

/** Profil → Notifikasi email: which emails this person gets (only events their role can receive). */
export function NotificationPrefs({ role, initial, emailEnabled, isAdmin }: { role: Role; initial: Record<string, boolean>; emailEnabled: boolean; isAdmin: boolean }) {
  const events = EMAIL_EVENTS.filter((e) => e.visibleTo.includes(role));
  const [prefs, setPrefs] = useState(() => Object.fromEntries(events.map((e) => [e.key, prefOn(initial, e.key)])) as Record<string, boolean>);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await saveNotificationPrefs(prefs);
      setMessage(result.ok ? { tone: "success", text: "Pilihan notifikasi disimpan." } : { tone: "error", text: result.error });
    });
  }

  return (
    <div className="max-w-xl space-y-4">
      {!emailEnabled && (
        <p className="rounded-lg bg-fill px-3 py-2 text-xs text-fg-muted">
          Email belum diaktifkan untuk situs ini{isAdmin ? " (Pengaturan → Email)" : "; minta admin mengaturnya"}. Pilihan Anda tetap disimpan.
        </p>
      )}
      <ul className="space-y-3">
        {events.map((event) => (
          <li key={event.key}>
            <label className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" className="mt-0.5 accent-accent" checked={prefs[event.key]} onChange={(e) => setPrefs({ ...prefs, [event.key]: e.target.checked })} />
              <span>
                <span className="font-medium text-fg">{event.label}</span>
                <span className="block text-xs text-fg-subtle">{event.description}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <Button size="sm" onClick={save} disabled={pending}>
        Simpan
      </Button>
    </div>
  );
}
