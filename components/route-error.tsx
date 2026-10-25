"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Errors a reload fixes: a tab still running the previous build asks for chunks
 * that no longer exist, or a request failed while the server restarted.
 */
const TRANSIENT = /ChunkLoadError|Loading (CSS )?chunk|dynamically imported module|Failed to fetch|NetworkError|Load failed|fetch failed|RSC payload/i;
const RELOAD_KEY = "docsku:error-reload";

/** Reloads the page once (per minute) for a transient error; true if it did. */
export function reloadOnce(error: unknown) {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  if (!TRANSIENT.test(text)) return false;
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // No sessionStorage: still reload, the guard above only prevents loops.
  }
  window.location.reload();
  return true;
}

/** Fallback for app/(site)/error.tsx and app/admin/error.tsx. */
export function RouteError({ error, retry, home }: { error: unknown; retry: () => void; home: { href: string; label: string } }) {
  useEffect(() => {
    console.error(error);
    reloadOnce(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-6 text-center" role="alert">
      <h1 className="font-serif text-3xl font-light text-fg">Halaman gagal dimuat</h1>
      <p className="mt-3 text-fg-muted">Terjadi gangguan sesaat. Coba lagi, biasanya langsung berhasil.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="rounded-full bg-fg px-4 py-2 text-sm font-medium text-page hover:opacity-85"
        >
          Coba lagi
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-full border border-line px-4 py-2 text-sm text-fg hover:bg-fill"
        >
          Muat ulang halaman
        </button>
        <Link href={home.href} className="rounded-full border border-line px-4 py-2 text-sm text-fg hover:bg-fill">
          {home.label}
        </Link>
      </div>
    </main>
  );
}
