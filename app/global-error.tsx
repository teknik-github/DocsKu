"use client";

import { useEffect } from "react";
import { reloadOnce } from "@/components/route-error";

/** Replaces the root layout when it fails, so it brings its own document and plain styles. */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
    reloadOnce(error);
  }, [error]);

  return (
    <html lang="id">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, textAlign: "center" }}>
        <title>Halaman gagal dimuat</title>
        <div>
          <h1 style={{ fontWeight: 400 }}>Halaman gagal dimuat</h1>
          <p style={{ color: "#666" }}>Terjadi gangguan sesaat. Coba lagi, biasanya langsung berhasil.</p>
          <button type="button" onClick={() => retry()} style={{ marginRight: 8, padding: "8px 16px" }}>
            Coba lagi
          </button>
          <button type="button" onClick={() => window.location.reload()} style={{ padding: "8px 16px" }}>
            Muat ulang halaman
          </button>
        </div>
      </body>
    </html>
  );
}
