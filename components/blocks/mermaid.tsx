"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * A Mermaid diagram, drawn in the browser. The library loads only when a page
 * has a diagram, renders with `securityLevel: "strict"` (its own sanitising,
 * no HTML labels or click handlers), and redraws when the site switches between
 * light and dark. Until then (and if the code is invalid) the source is shown.
 */
export function MermaidDiagram({ code, caption }: { code: string; caption?: string | null }) {
  const id = useId().replace(/[^\w-]/g, "");
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<{ svg: string } | { error: string } | null>(null);

  useEffect(() => {
    let live = true;
    let version = 0;
    const draw = async () => {
      const mine = ++version;
      const source = code.trim();
      if (!source) return;
      try {
        const { default: mermaid } = await import("mermaid");
        const dark = document.documentElement.classList.contains("dark");
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: dark ? "dark" : "default", fontFamily: "inherit" });
        const { svg } = await mermaid.render(`mermaid-${id}-${mine}`, source);
        if (live && mine === version) setState({ svg });
      } catch (error) {
        if (live && mine === version) setState({ error: (error as Error).message?.split("\n")[0] || "Diagram tidak valid." });
      }
    };
    void draw();
    // Light/dark switches toggle the class on <html>.
    const observer = new MutationObserver(() => void draw());
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [code, id]);

  return (
    <figure className="not-prose my-6" data-mermaid>
      {state && "svg" in state ? (
        <div
          ref={box}
          role="img"
          aria-label={caption || "Diagram"}
          className="overflow-x-auto rounded-xl border border-line bg-surface p-4 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
          // Mermaid's own output (securityLevel "strict" sanitises labels).
          dangerouslySetInnerHTML={{ __html: state.svg }}
        />
      ) : (
        <div className="rounded-xl border border-line bg-surface p-4">
          {state && "error" in state && <p className="mb-2 text-xs text-red-600 dark:text-red-400">Diagram tidak bisa digambar: {state.error}</p>}
          <pre className="overflow-x-auto font-mono text-xs leading-relaxed text-fg-muted">{code}</pre>
        </div>
      )}
      {caption && <figcaption className="mt-2 text-center text-sm text-fg-subtle">{caption}</figcaption>}
    </figure>
  );
}
