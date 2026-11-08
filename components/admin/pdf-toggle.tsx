"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { savePdfDownloads } from "@/app/admin/_actions/site";

/** Tema → PDF: "Unduh PDF" on articles and categories, and the /pdf/… downloads behind them. */
export function PdfToggle({ initial }: { initial: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function toggle() {
    const next = !on;
    setOn(next);
    setError(null);
    start(async () => {
      const result = await savePdfDownloads(next);
      if (!result.ok) {
        setOn(!next);
        setError(result.error);
      } else router.refresh();
    });
  }

  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-line bg-surface p-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-fg">Unduh PDF</p>
        <p className="mt-0.5 text-sm text-fg-muted">
          Tombol “Unduh PDF” di setiap artikel dan “Unduh PDF kategori” di halaman kategori. Berkas PDF dibuat dari isi yang terbit, lengkap dengan judul, penulis, tanggal, nomor halaman, dan daftar isi untuk kategori.
        </p>
        {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Unduh PDF"
        onClick={toggle}
        disabled={pending}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${on ? "bg-accent" : "bg-line-strong"}`}
      >
        <span className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}
