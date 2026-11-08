"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveShowAuthors } from "@/app/admin/_actions/site";

/** Tema → Penulis: one switch for the byline, the "Tentang penulis" box and /penulis pages. */
export function ShowAuthorsToggle({ initial }: { initial: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function toggle() {
    const next = !on;
    setOn(next);
    setError(null);
    start(async () => {
      const result = await saveShowAuthors(next);
      if (!result.ok) {
        setOn(!next);
        setError(result.error);
      } else router.refresh();
    });
  }

  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-line bg-surface p-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-fg">Tampilkan penulis di artikel</p>
        <p className="mt-0.5 text-sm text-fg-muted">
          Foto, nama, dan jabatan penulis di bawah judul, kotak “Tentang penulis” di akhir artikel, dan halaman /penulis/… untuk anggota tim yang punya username. Profil diisi masing-masing di Profil.
        </p>
        {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Tampilkan penulis di artikel"
        onClick={toggle}
        disabled={pending}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${on ? "bg-accent" : "bg-line-strong"}`}
      >
        <span className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}
