"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { copyText } from "@/lib/copy-text";
import { useSite } from "@/components/site-context";
import { t } from "@/lib/i18n";
import { PdfButton } from "@/components/pdf-button";

/** "Salin halaman" (Markdown to the clipboard), with "Unduh PDF" beside it on /docs pages. */
export function CopyPageButton({ markdown }: { markdown: string }) {
  const [copied, setCopied] = useState(false);
  const { locale } = useSite();

  async function copy() {
    if (!(await copyText(markdown))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={copy}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-xs text-fg-muted transition-colors hover:bg-fill hover:text-fg"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {t(locale, copied ? "copied" : "copyPage")}
      </button>
      <PdfButton />
    </span>
  );
}
