"use client";

import { Children, isValidElement, useState } from "react";

export function Tab({ children }: { title: string; children: React.ReactNode }) {
  return <div className="[&>*+*]:mt-4">{children}</div>;
}

/**
 * ```mdx
 * <Tabs>
 *   <Tab title="macOS">…</Tab>
 *   <Tab title="Windows">…</Tab>
 * </Tabs>
 * ```
 */
export function Tabs({ children }: { children: React.ReactNode }) {
  const tabs = Children.toArray(children).filter(isValidElement<{ title: string }>);
  const [active, setActive] = useState(0);

  return (
    <div>
      <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map((tab, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === active}
            onClick={() => setActive(i)}
            className={`relative h-9 shrink-0 px-3 text-sm whitespace-nowrap transition-colors ${
              i === active
                ? "text-fg after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-accent"
                : "text-fg-subtle hover:text-fg"
            }`}
          >
            {tab.props.title}
          </button>
        ))}
      </div>
      {tabs[active]}
    </div>
  );
}
