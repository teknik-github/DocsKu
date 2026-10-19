import { ChevronRight } from "lucide-react";

export function Accordion({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-xl border border-line bg-surface [&+&]:mt-2">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-fg [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 text-fg-subtle transition-transform group-open:rotate-90" />
        {title}
      </summary>
      <div className="border-t border-line px-4 py-3 text-sm [&>*+*]:mt-3">{children}</div>
    </details>
  );
}
