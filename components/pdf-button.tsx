"use client";

import { usePathname } from "next/navigation";
import { FileDown } from "lucide-react";
import { useSite } from "@/components/site-context";
import { t } from "@/lib/i18n";

const pill =
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-xs text-fg-muted transition-colors hover:bg-fill hover:text-fg";

/**
 * "Unduh PDF" for the article being read (/pdf/docs/<slug>, lib/pdf/service.tsx).
 * Shown on /docs pages only (not in previews) and while Tema → PDF is on.
 */
export function PdfButton() {
  const pathname = usePathname();
  const { site, locale } = useSite();
  if (site.pdfDownloads === false || !pathname.startsWith("/docs/")) return null;
  return (
    <a href={`/pdf${pathname}`} download className={pill} rel="nofollow">
      <FileDown className="size-3.5" />
      {t(locale, "downloadPdf")}
    </a>
  );
}

/** "Unduh PDF kategori" for a navigation section (a category), in the language being read. */
export function CategoryPdfLink({ sectionId, className }: { sectionId: string | undefined; className?: string }) {
  const { site, locale, i18n } = useSite();
  if (!sectionId || site.pdfDownloads === false) return null;
  const query = i18n && locale !== i18n.defaultLocale ? `?bahasa=${encodeURIComponent(locale)}` : "";
  return (
    <a href={`/pdf/kategori/${encodeURIComponent(sectionId)}${query}`} download rel="nofollow" className={className ?? "inline-flex items-center gap-1 text-xs text-fg-muted hover:text-accent"}>
      <FileDown className="size-3.5" />
      {t(locale, "downloadCategoryPdf")}
    </a>
  );
}
