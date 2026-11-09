"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { createTelegramLinkCode, getTelegramLink, sendTelegramTest, unlinkTelegram } from "@/app/admin/_actions/telegram";
import { confirmDialog } from "@/components/admin/dialog";
import { Alert, Button, buttonClass } from "@/components/admin/ui";

/**
 * Profil → Telegram: link this account to a Telegram chat with the site's bot
 * (a one-time code sent as "/start <code>"), send a test message, or unlink.
 */
export function TelegramLink({
  botEnabled,
  botUsername,
  isAdmin,
  initial,
}: {
  botEnabled: boolean;
  botUsername: string | null;
  isAdmin: boolean;
  initial: { linked: boolean; username: string | null; linkedAt: string | null };
}) {
  const router = useRouter();
  const [link, setLink] = useState(initial);
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, start] = useTransition();

  // While a code is shown, watch for the chat to be linked.
  useEffect(() => {
    if (!code) return;
    const timer = setInterval(async () => {
      if (Date.now() > new Date(code.expiresAt).getTime()) {
        setCode(null);
        return;
      }
      const current = await getTelegramLink();
      if (current.linked) {
        setLink(current);
        setCode(null);
        setMessage({ tone: "success", text: "Telegram terhubung. Coba kirim pertanyaan ke bot." });
        router.refresh();
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [code, router]);

  if (!botEnabled) {
    return (
      <p className="rounded-lg bg-fill px-3 py-2 text-xs text-fg-muted">
        Bot Telegram belum diaktifkan{isAdmin ? " (Pengaturan → Telegram)" : "; minta admin mengaktifkannya"}.
      </p>
    );
  }

  return (
    <div className="max-w-xl space-y-4" data-testid="telegram-link">
      {link.linked ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Send className="size-4" />
          </span>
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium text-fg">Terhubung{link.username ? ` sebagai @${link.username}` : ""}</p>
            <p className="text-xs text-fg-subtle">
              Chat dengan{" "}
              {botUsername ? (
                <a href={`https://t.me/${botUsername}`} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                  @{botUsername}
                </a>
              ) : (
                "bot situs"
              )}{" "}
              untuk memakai AI Chat dan perintah seperti /cari, /draf, /tinjau.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const result = await sendTelegramTest();
                  setMessage(result.ok ? { tone: "success", text: "Pesan uji terkirim." } : { tone: "error", text: result.error });
                })
              }
            >
              Kirim pesan uji
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={pending}
              onClick={async () => {
                const ok = await confirmDialog({ title: "Putuskan Telegram?", message: "Bot tidak akan menjawab chat Anda lagi sampai dihubungkan ulang.", confirmLabel: "Putuskan", tone: "danger" });
                if (!ok) return;
                start(async () => {
                  await unlinkTelegram();
                  setLink({ linked: false, username: null, linkedAt: null });
                  setMessage(null);
                  router.refresh();
                });
              }}
            >
              Putuskan
            </Button>
          </div>
        </div>
      ) : code ? (
        <div className="space-y-3 rounded-lg border border-line bg-page p-4 text-sm">
          <p>
            Kirim pesan ini ke{" "}
            {botUsername ? (
              <a href={`https://t.me/${botUsername}`} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">
                @{botUsername}
              </a>
            ) : (
              "bot situs"
            )}{" "}
            dalam 10 menit:
          </p>
          <p className="font-mono text-lg font-semibold tracking-wider text-fg" data-testid="telegram-code">
            /start {code.code}
          </p>
          <div className="flex flex-wrap gap-2">
            {botUsername && (
              <a href={`https://t.me/${botUsername}?start=${code.code}`} target="_blank" rel="noreferrer" className={buttonClass("accent", "sm")}>
                <Send className="size-3.5" />
                Buka di Telegram
              </a>
            )}
            <Button size="sm" variant="ghost" onClick={() => setCode(null)}>
              Batal
            </Button>
          </div>
          <p className="text-xs text-fg-subtle">Halaman ini memperbarui sendiri setelah terhubung.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-fg-muted">Tanya AI Chat, buat draf, dan terima notifikasi dari HP lewat Telegram.</p>
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setMessage(null);
                const result = await createTelegramLinkCode();
                if (!result.ok) return setMessage({ tone: "error", text: result.error });
                setCode({ code: result.code, expiresAt: result.expiresAt });
              })
            }
          >
            <Send className="size-3.5" />
            Hubungkan Telegram
          </Button>
        </div>
      )}
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
    </div>
  );
}
