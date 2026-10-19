"use client";

import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label="Salin kode"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex size-7 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-fill hover:text-fg"
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  );
}

export function CodeGroupTabs({
  items,
}: {
  items: { label: string; code: string; content: ReactNode }[];
}) {
  const [active, setActive] = useState(0);
  const current = items[active] ?? items[0];
  if (!current) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-code">
      <div className="flex items-center gap-2 border-b border-line pr-1.5 pl-2">
        <div role="tablist" className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {items.map((item, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === active}
              onClick={() => setActive(i)}
              className={`relative h-10 shrink-0 px-2.5 text-xs whitespace-nowrap transition-colors ${
                i === active
                  ? "text-fg after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent"
                  : "text-fg-subtle hover:text-fg"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <CopyButton text={current.code} />
      </div>
      {current.content}
    </div>
  );
}
