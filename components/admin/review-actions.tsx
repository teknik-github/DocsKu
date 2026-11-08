"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, RefreshCw } from "lucide-react";
import { markReviewed, runExternalLinkCheck } from "@/app/admin/_actions/review";
import { Button } from "@/components/admin/ui";

/** "Tandai ditinjau" on a row of Tinjauan: the page is current, so its next review moves out by its interval. */
export function MarkReviewedButton({ pageId, title }: { pageId: string; title: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  return (
    <>
      <button
        type="button"
        disabled={pending}
        title={error || undefined}
        aria-label={`Tandai ${title || "halaman"} sudah ditinjau`}
        onClick={() =>
          startTransition(async () => {
            const result = await markReviewed([pageId]);
            if (!result.ok) return setError(result.error);
            router.refresh();
          })
        }
        className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs disabled:opacity-50 ${
          error ? "border-red-300 text-red-600" : "border-line text-fg hover:bg-fill"
        }`}
      >
        <CheckCircle2 className="size-3.5" />
        {pending ? "Menyimpan…" : "Tandai ditinjau"}
      </button>
    </>
  );
}

/** Runs the external link check (up to 200 URLs, oldest checks first) and refreshes the list. */
export function CheckExternalButton({ total }: { total: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  return (
    <span className="flex items-center gap-3">
      {message && <span className={`text-xs ${message.tone === "error" ? "text-red-600 dark:text-red-400" : "text-fg-muted"}`}>{message.text}</span>}
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setMessage(null);
            const result = await runExternalLinkCheck();
            if (!result.ok) return setMessage({ tone: "error", text: result.error });
            setMessage({
              tone: "ok",
              text: `${result.checked} diperiksa, ${result.broken} bermasalah${result.remaining ? `, ${result.remaining} belum sempat (jalankan lagi)` : ""}.`,
            });
            router.refresh();
          })
        }
      >
        <RefreshCw className={`size-3.5 ${pending ? "animate-spin" : ""}`} />
        {pending ? `Memeriksa ${Math.min(total, 200)} tautan…` : "Periksa tautan luar"}
      </Button>
    </span>
  );
}
