"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, RotateCcw, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import { deleteFeedback, setFeedbackResolved } from "@/app/admin/_actions/stats";
import type { FeedbackItem } from "@/lib/data/stats";
import { formatDateTime } from "@/components/admin/format";
import { Alert, buttonClass } from "@/components/admin/ui";

/** Reader feedback list with "done" and delete actions. */
export function StatsFeedback({ items }: { items: FeedbackItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError("");
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  if (items.length === 0) return <p className="px-5 py-8 text-center text-sm text-fg-subtle">Tidak ada masukan.</p>;
  return (
    <>
      {error && (
        <div className="px-5 pt-3">
          <Alert>{error}</Alert>
        </div>
      )}
      <ul className="divide-y divide-line" data-testid="feedback-list">
        {items.map((item) => (
          <li key={item.id} className={`flex gap-3 px-5 py-3 ${item.resolved ? "opacity-60" : ""}`}>
            <span
              className={`mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full ${
                item.helpful
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                  : "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300"
              }`}
              aria-label={item.helpful ? "Membantu" : "Tidak membantu"}
            >
              {item.helpful ? <ThumbsUp className="size-3.5" /> : <ThumbsDown className="size-3.5" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-fg-subtle">
                <Link href={`/admin/pages/${item.pageId}`} className="text-sm text-fg hover:underline">
                  {item.pageTitle || "Tanpa judul"}
                </Link>
                <span>{formatDateTime(item.createdAt)}</span>
                {item.resolved && <span>· Selesai</span>}
              </div>
              {item.comment ? (
                <p className="mt-1 text-sm whitespace-pre-wrap break-words text-fg-muted">{item.comment}</p>
              ) : (
                <p className="mt-1 text-xs text-fg-subtle italic">Tanpa pesan</p>
              )}
            </div>
            <div className="flex shrink-0 items-start gap-1">
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => setFeedbackResolved(item.id, !item.resolved))}
                className={buttonClass("ghost", "sm")}
              >
                {item.resolved ? <RotateCcw className="size-3.5" /> : <Check className="size-3.5" />}
                {item.resolved ? "Buka lagi" : "Selesai"}
              </button>
              <button
                type="button"
                disabled={pending}
                aria-label="Hapus masukan"
                onClick={() => {
                  if (confirm("Hapus masukan ini?")) run(() => deleteFeedback(item.id));
                }}
                className={`${buttonClass("ghost", "sm")} hover:text-red-600`}
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
