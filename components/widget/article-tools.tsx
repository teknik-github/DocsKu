"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { beacon } from "@/components/reader-footer";

/** "Kembali": the previous widget screen (keeps the search), or the start. */
export function WidgetBack() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => (window.history.length > 1 ? router.back() : router.push("/widget"))}
      className="flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg"
    >
      <ArrowLeft className="size-3.5" />
      Kembali
    </button>
  );
}

/** Counts a view of the article, once per tab, like the article page does. */
export function WidgetView({ slug }: { slug: string }) {
  useEffect(() => {
    const key = `docsku:view:${slug}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      // Storage can be blocked in third-party frames; count anyway.
    }
    beacon("/api/track", { type: "view", slug });
  }, [slug]);
  return null;
}
