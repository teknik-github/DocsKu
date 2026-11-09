"use client";

import { useState, useTransition } from "react";
import { saveNotificationPrefs } from "@/app/admin/_actions/notifications";
import { Alert, Button } from "@/components/admin/ui";
import { EMAIL_EVENTS, prefOn, telegramPrefOn } from "@/lib/notifications/catalog";
import type { Role } from "@/db/schema";

/**
 * Profil → Notifikasi: which emails this person gets (only events their role can
 * receive), and with a linked Telegram chat, which come as Telegram messages.
 */
export function NotificationPrefs({
  role,
  initial,
  emailEnabled,
  isAdmin,
  telegram = false,
}: {
  role: Role;
  initial: Record<string, boolean>;
  emailEnabled: boolean;
  isAdmin: boolean;
  /** The person linked Telegram: show a Telegram switch per event. */
  telegram?: boolean;
}) {
  const events = EMAIL_EVENTS.filter((e) => e.visibleTo.includes(role));
  const [prefs, setPrefs] = useState(
    () =>
      Object.fromEntries([
        ...events.map((e) => [e.key, prefOn(initial, e.key)]),
        ...events.filter((e) => e.telegram).map((e) => [`tg:${e.key}`, telegramPrefOn(initial, e.key)]),
      ]) as Record<string, boolean>,
  );
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
      {telegram ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] text-fg-subtle">
              <th className="pb-2 font-medium">Kejadian</th>
              <th className="w-16 pb-2 text-center font-medium">Email</th>
              <th className="w-16 pb-2 text-center font-medium">Telegram</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {events.map((event) => (
              <tr key={event.key}>
                <td className="py-2 pr-3 align-top">
                  <span className="font-medium text-fg">{event.label}</span>
                  <span className="block text-xs text-fg-subtle">{event.description}</span>
                </td>
                <td className="py-2 text-center align-top">
                  <input type="checkbox" aria-label={`${event.label} lewat email`} className="mt-1 accent-accent" checked={prefs[event.key]} onChange={(e) => setPrefs({ ...prefs, [event.key]: e.target.checked })} />
                </td>
                <td className="py-2 text-center align-top">
                  {event.telegram ? (
                    <input
                      type="checkbox"
                      aria-label={`${event.label} lewat Telegram`}
                      className="mt-1 accent-accent"
                      checked={prefs[`tg:${event.key}`]}
                      onChange={(e) => setPrefs({ ...prefs, [`tg:${event.key}`]: e.target.checked })}
                    />
                  ) : (
                    <span className="text-xs text-fg-subtle" title="Hanya lewat email">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
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
      )}
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <Button size="sm" onClick={save} disabled={pending}>
        Simpan
      </Button>
    </div>
  );
}
