"use client";

import { useState, useTransition } from "react";
import { Globe, Lock } from "lucide-react";
import { setPagesVisibility } from "@/app/admin/_actions/visibility";

/**
 * Who may read the page: everyone, or only signed-in team members ("internal":
 * off the public site, search, sitemap and Tanya AI). Applies immediately.
 */
export function VisibilityToggle({ pageId, initial }: { pageId: string; initial: "public" | "internal" }) {
  const [visibility, setVisibility] = useState(initial);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function choose(next: "public" | "internal") {
    if (next === visibility) return;
    const previous = visibility;
    setVisibility(next);
    setError("");
    startTransition(async () => {
      const result = await setPagesVisibility([pageId], next);
      if (!result.ok) {
        setVisibility(previous);
        setError(result.error);
      }
    });
  }

  const option = (value: "public" | "internal", label: string, Icon: typeof Globe) => (
    <button
      type="button"
      role="radio"
      aria-checked={visibility === value}
      disabled={pending}
      onClick={() => choose(value)}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors ${
        visibility === value ? "bg-surface font-medium text-fg shadow-sm" : "text-fg-muted hover:text-fg"
      }`}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );

  return (
    <section className="space-y-2">
      <p className="text-sm font-medium text-fg">Siapa yang bisa membaca</p>
      <div role="radiogroup" aria-label="Visibilitas halaman" className="flex gap-1 rounded-lg bg-fill p-1">
        {option("public", "Publik", Globe)}
        {option("internal", "Internal", Lock)}
      </div>
      <p className="text-xs text-fg-subtle">
        {visibility === "internal"
          ? "Hanya tim yang masuk. Tidak tampil di navigasi publik, pencarian, sitemap, maupun Tanya AI. Langsung berlaku."
          : "Semua pengunjung setelah halaman terbit. Langsung berlaku."}
      </p>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </section>
  );
}
