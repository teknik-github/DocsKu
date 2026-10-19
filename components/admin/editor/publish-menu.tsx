"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { formatDateTime } from "@/components/admin/format";
import { Button, buttonClass, inputClass } from "@/components/admin/ui";

type Status = "draft" | "scheduled" | "published";

/** Value for <input type="datetime-local"> in the browser's time zone. */
function toLocalInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function PublishMenu({
  status,
  publishedAt,
  hasChanges,
  busy,
  onPublish,
  onUnpublish,
  onDiscard,
}: {
  status: Status;
  publishedAt: string | null;
  hasChanges: boolean;
  busy: boolean;
  onPublish: (when: string | null) => Promise<boolean>;
  onUnpublish: () => Promise<boolean>;
  onDiscard: () => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"now" | "schedule">("now");
  const [when, setWhen] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    if (!open) {
      const base = status === "scheduled" && publishedAt ? new Date(publishedAt) : new Date(Date.now() + 60 * 60 * 1000);
      setWhen(toLocalInput(base));
      setMode(status === "scheduled" ? "schedule" : "now");
    }
    setOpen(!open);
  }

  const run = async (action: () => Promise<boolean>) => {
    if (await action()) setOpen(false);
  };

  const label =
    status === "published" ? (hasChanges ? "Perbarui" : "Terbit") : status === "scheduled" ? "Terjadwal" : "Terbitkan";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className={buttonClass(status === "published" && !hasChanges ? "secondary" : "accent", "sm")}
      >
        {label}
        <ChevronDown className="size-3.5" />
      </button>

      {open && (
        <div className="absolute top-full right-0 z-50 mt-2 w-80 rounded-xl border border-line bg-surface p-4 shadow-xl">
          {status === "published" ? (
            <div className="space-y-3">
              <p className="text-sm text-fg-muted">
                Terbit sejak <span className="text-fg">{formatDateTime(publishedAt)}</span>.
              </p>
              {hasChanges ? (
                <>
                  <p className="text-sm text-fg-muted">Ada perubahan yang belum tampil di situs.</p>
                  <Button variant="accent" className="w-full" disabled={busy} onClick={() => run(() => onPublish(null))}>
                    Perbarui halaman
                  </Button>
                  <Button variant="secondary" className="w-full" disabled={busy} onClick={() => run(onDiscard)}>
                    Buang perubahan
                  </Button>
                </>
              ) : (
                <p className="text-sm text-fg-muted">Situs sudah menampilkan versi terbaru.</p>
              )}
              <Button
                variant="danger"
                className="w-full"
                disabled={busy}
                onClick={() => confirm("Tarik halaman ini dari situs? Isinya tetap tersimpan sebagai draf.") && run(onUnpublish)}
              >
                Batalkan terbit
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {status === "scheduled" && (
                <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
                  Dijadwalkan terbit {formatDateTime(publishedAt)}.
                </p>
              )}
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" checked={mode === "now"} onChange={() => setMode("now")} className="accent-accent" />
                Terbitkan sekarang
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" checked={mode === "schedule"} onChange={() => setMode("schedule")} className="accent-accent" />
                Jadwalkan
              </label>
              {mode === "schedule" && (
                <input
                  type="datetime-local"
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                  className={inputClass}
                />
              )}
              <Button
                variant="accent"
                className="w-full"
                disabled={busy || (mode === "schedule" && !when)}
                onClick={() => run(() => onPublish(mode === "schedule" ? new Date(when).toISOString() : null))}
              >
                {mode === "schedule" ? (status === "scheduled" ? "Simpan jadwal" : "Jadwalkan") : "Terbitkan sekarang"}
              </Button>
              {status === "scheduled" && (
                <Button variant="secondary" className="w-full" disabled={busy} onClick={() => run(onUnpublish)}>
                  Batalkan jadwal
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
