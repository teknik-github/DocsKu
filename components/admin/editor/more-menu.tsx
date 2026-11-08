"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";

export type MoreMenuItem = { label: string; icon: ReactNode; onSelect: () => void; active?: boolean };

/**
 * The editor header's "⋯" menu on narrow screens: actions that sit in the
 * header as their own buttons from `sm` up (AI Chat, Pratinjau) move here so
 * the header never scrolls sideways. Esc or a click outside closes it.
 */
export function EditorMoreMenu({ items, className = "" }: { items: MoreMenuItem[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!items.length) return null;
  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Menu lainnya"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`inline-flex size-8 items-center justify-center rounded-lg ${open ? "bg-fill text-fg" : "text-fg-muted hover:bg-fill"}`}
      >
        <MoreHorizontal className="size-4" />
      </button>
      {open && (
        <div role="menu" className="absolute top-full right-0 z-50 mt-2 w-48 rounded-xl border border-line bg-surface p-1 shadow-xl">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-fill ${item.active ? "text-fg" : "text-fg-muted"}`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
