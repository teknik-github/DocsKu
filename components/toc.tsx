"use client";

import { useEffect, useState } from "react";
import type { Heading } from "@/lib/content/doc";

export function TableOfContents({ headings }: { headings: Heading[] }) {
  const [activeId, setActiveId] = useState(headings[0]?.id);

  useEffect(() => {
    const elements = headings
      .map((heading) => document.getElementById(heading.id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    // The active heading is the last one that has scrolled past the top band.
    function update() {
      const offset = 120;
      let current = elements[0].id;
      for (const el of elements) {
        if (el.getBoundingClientRect().top - offset <= 0) current = el.id;
      }
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      setActiveId(atBottom ? elements[elements.length - 1].id : current);
    }
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [headings]);

  if (headings.length === 0) return null;

  return (
    <nav aria-label="Di halaman ini" className="text-sm">
      <div className="mb-3 text-xs font-medium text-fg">Di halaman ini</div>
      <ul className="space-y-0.5 border-l border-line">
        {headings.map((heading) => {
          const active = heading.id === activeId;
          return (
            <li key={heading.id}>
              <a
                href={`#${heading.id}`}
                className={`-ml-px block border-l py-1 transition-colors ${
                  heading.level === 3 ? "pl-6" : "pl-3"
                } ${
                  active
                    ? "border-accent text-fg"
                    : "border-transparent text-fg-subtle hover:text-fg"
                }`}
              >
                {heading.text}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
