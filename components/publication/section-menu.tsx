"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, List } from "lucide-react";
import type { NavLink } from "@/lib/site-types";

/** "Di bagian ini": the pages of the current section, for layouts without a sidebar. */
export function SectionMenu({ section, pages, current }: { section: string; pages: NavLink[]; current: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const index = pages.findIndex((page) => page.href === current);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-xs text-fg-muted hover:text-fg"
      >
        <List className="size-3.5" />
        Di bagian ini
        {index >= 0 && <span className="text-fg-subtle">· {index + 1}/{pages.length}</span>}
        <ChevronDown className={`size-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute top-full right-0 z-30 mt-2 w-72 rounded-xl border border-line bg-surface p-1.5 shadow-xl">
          <p className="px-2.5 pt-1.5 pb-2 text-[11px] font-semibold tracking-wide text-fg-subtle uppercase">{section}</p>
          {pages.map((page, i) => {
            const active = page.href === current;
            return (
              <Link
                key={page.href}
                href={page.href}
                prefetch={true}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm ${active ? "bg-fill text-fg" : "text-fg-muted hover:bg-fill/60 hover:text-fg"}`}
              >
                <span className="w-4 shrink-0 text-right text-xs text-fg-subtle">{i + 1}</span>
                <span className="flex-1 truncate">{page.title}</span>
                {active && <Check className="size-3.5 text-accent" />}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
