"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { connectTelegramBot, disconnectTelegramBot } from "@/app/admin/_actions/telegram";
import type { TelegramSettingsView } from "@/lib/telegram/settings";
import { Alert, Button, Field, Input, Panel } from "@/components/admin/ui";

/**
 * Pengaturan → Telegram (admins): the site's bot. Team members then link their
 * own chat in Profil → Telegram and talk to AI Chat, run commands and get
 * personal notifications there.
 */
export function TelegramSettingsForm({ initial, canEncrypt, linkedCount }: { initial: TelegramSettingsView; canEncrypt: boolean; linkedCount: number }) {
  const [view, setView] = useState(initial);
  const [token, setToken] = useState("");
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, start] = useTransition();

  function connect(useStored: boolean) {
    setMessage(null);
    start(async () => {
      const result = await connectTelegramBot({ token: useStored ? undefined : token });
      if (!result.ok) return setMessage({ tone: "error", text: result.error });
      setView(result.view);
      setToken("");
      setMessage({ tone: "success", text: `Bot @${result.view.botUsername ?? "?"} aktif. Anggota tim bisa menghubungkan akunnya di Profil → Telegram.` });
    });
  }

  function disconnect() {
    setMessage(null);
    start(async () => {
      const result = await disconnectTelegramBot();
      if (!result.ok) return setMessage({ tone: "error", text: result.error });
      setView(result.view);
      setMessage({ tone: "success", text: "Bot dimatikan. Pesan ke bot tidak dijawab lagi." });
    });
  }

  return (
    <Panel className="max-w-3xl space-y-5 p-5" data-testid="telegram-settings">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <Send className="size-4 text-accent" />
          Bot Telegram
        </h2>
        <p className="mt-1 text-xs text-fg-subtle">
          Tim bisa bertanya ke AI Chat, membuat draf, menerapkan usulan ke draf, mencari halaman, melihat tinjauan dan memoderasi komentar langsung dari Telegram, plus menerima notifikasi pribadi. Bot
          tidak pernah menerbitkan halaman.
        </p>
      </div>

      {view.enabled && view.botUsername ? (
        <div className="rounded-lg border border-line bg-page p-3 text-sm">
          <p>
            <span className="font-medium text-fg">Aktif:</span>{" "}
            <a href={`https://t.me/${view.botUsername}`} target="_blank" rel="noreferrer" className="text-accent hover:underline">
              @{view.botUsername}
            </a>
            {view.botName ? <span className="text-fg-muted"> ({view.botName})</span> : null}
          </p>
          <p className="mt-1 text-xs text-fg-subtle">
            Webhook: {view.origin}/api/telegram · {linkedCount} akun terhubung
          </p>
        </div>
      ) : (
        <ol className="list-decimal space-y-1 pl-5 text-xs text-fg-muted">
          <li>
            Buka <span className="font-medium text-fg">@BotFather</span> di Telegram, kirim <code>/newbot</code>, lalu ikuti langkahnya.
          </li>
          <li>Salin token yang diberikan (bentuknya <code>123456789:ABC…</code>) dan tempel di bawah.</li>
          <li>Situs harus bisa dibuka dari internet lewat https (SITE_URL), karena Telegram mengirim pesan ke alamat itu.</li>
        </ol>
      )}

      {!canEncrypt && <Alert>ENCRYPTION_KEY belum diatur di server, jadi token tidak bisa disimpan.</Alert>}

      <Field label={view.hasToken ? "Ganti token bot" : "Token bot"} hint="Disimpan terenkripsi, tidak pernah ditampilkan lagi.">
        <Input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="123456789:ABCdef…" aria-label="Token bot Telegram" />
      </Field>

      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => connect(false)} disabled={pending || !token.trim() || !canEncrypt}>
          {view.hasToken ? "Simpan & hubungkan" : "Hubungkan bot"}
        </Button>
        {view.hasToken && (
          <Button size="sm" variant="secondary" onClick={() => connect(true)} disabled={pending}>
            {view.enabled ? "Daftarkan ulang webhook" : "Aktifkan lagi"}
          </Button>
        )}
        {view.enabled && (
          <Button size="sm" variant="secondary" onClick={disconnect} disabled={pending}>
            Matikan bot
          </Button>
        )}
      </div>
    </Panel>
  );
}
