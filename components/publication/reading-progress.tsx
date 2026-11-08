"use client";

import { useSite } from "@/components/site-context";
import { t } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** A thin bar under the header showing how far the reader is through the page. */
export function ReadingProgress() {
  const { locale } = useSite();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        setProgress(max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 1);
      });
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div
      role="progressbar"
      aria-label={t(locale, "readingProgress")}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      className="fixed inset-x-0 top-(--header-h) z-30 h-0.5 bg-transparent"
    >
      <div className="h-full origin-left bg-accent transition-transform duration-75" style={{ transform: `scaleX(${progress})` }} />
    </div>
  );
}

/** ← and → turn the page, as in an e-reader (ignored while typing or with a modifier key). */
export function PageTurnKeys({ prev, next }: { prev?: string; next?: string }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return;
      const href = e.key === "ArrowLeft" ? prev : e.key === "ArrowRight" ? next : undefined;
      if (href) router.push(href);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next, router]);
  return null;
}
