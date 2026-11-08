"use client";

import { useEffect, useState, useTransition } from "react";
import { CalendarClock, CheckCircle2 } from "lucide-react";
import { getPageReview, markReviewed, setPageOwner, setReviewInterval, type PageReviewInfo } from "@/app/admin/_actions/review";
import { formatDateTime } from "@/components/admin/format";
import { Button, Select } from "@/components/admin/ui";

const INTERVALS = [30, 90, 180, 365];

/** "Tinjauan konten" in the editor's settings: owner, how often to review, and "Tandai sudah ditinjau". Changes apply at once. */
export function ReviewSection({ pageId, status }: { pageId: string; status: "draft" | "scheduled" | "published" }) {
  const [info, setInfo] = useState<PageReviewInfo | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let live = true;
    getPageReview(pageId).then((value) => live && setInfo(value));
    return () => {
      live = false;
    };
    // Reload after a publish, which counts as a review.
  }, [pageId, status]);

  if (info === undefined) return <div className="h-24 animate-pulse rounded-lg bg-fill" aria-hidden />;
  if (info === null) return null;

  const days = info.days;
  const defaultLabel = !info.settings.enabled ? "Bawaan (tinjauan mati)" : info.settings.defaultIntervalDays ? `Bawaan situs (${info.settings.defaultIntervalDays} hari)` : "Bawaan situs (tidak pernah)";

  function change(apply: () => Promise<{ ok: boolean; error?: string }>, next: Partial<PageReviewInfo>, previous: Partial<PageReviewInfo>) {
    setError("");
    setInfo((current) => current && { ...current, ...next });
    startTransition(async () => {
      const result = await apply();
      if (!result.ok) {
        setInfo((current) => current && { ...current, ...previous });
        setError(result.error ?? "Gagal menyimpan.");
      } else {
        // The due date depends on the interval: reload it.
        const fresh = await getPageReview(pageId);
        if (fresh) setInfo(fresh);
      }
    });
  }

  return (
    <section className="space-y-2" aria-labelledby="review-heading">
      <h3 id="review-heading" className="flex items-center gap-1.5 text-sm font-medium">
        <CalendarClock className="size-4" />
        Tinjauan konten
      </h3>
      <div className="space-y-1">
        <label htmlFor="review-owner" className="text-xs text-fg-muted">
          Penanggung jawab
        </label>
        <Select
          id="review-owner"
          value={info.ownerId ?? ""}
          disabled={pending}
          onChange={(e) => change(() => setPageOwner(pageId, e.target.value || null), { ownerId: e.target.value || null }, { ownerId: info.ownerId })}
          className="text-xs"
        >
          <option value="">{info.authorName ? `Penulis (${info.authorName})` : "Belum ada"}</option>
          {info.users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1">
        <label htmlFor="review-interval" className="text-xs text-fg-muted">
          Tinjau setiap
        </label>
        <Select
          id="review-interval"
          value={info.intervalDays === null ? "" : String(info.intervalDays)}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.value === "" ? null : Number(e.target.value);
            change(() => setReviewInterval(pageId, next), { intervalDays: next }, { intervalDays: info.intervalDays });
          }}
          className="text-xs"
        >
          <option value="">{defaultLabel}</option>
          {INTERVALS.map((d) => (
            <option key={d} value={d}>
              {d} hari
            </option>
          ))}
          <option value="0">Tidak perlu ditinjau</option>
        </Select>
      </div>
      {info.published ? (
        <div className="space-y-2 rounded-lg bg-fill/60 px-3 py-2 text-xs">
          <p className="text-fg-muted">
            Terakhir ditinjau <span className="text-fg">{formatDateTime(info.reviewedAt)}</span>
            {days !== null && (
              <>
                {" · "}
                {days < 0 ? (
                  <span className="font-medium text-amber-700 dark:text-amber-300">lewat {-days} hari</span>
                ) : (
                  <span>jatuh tempo {days === 0 ? "hari ini" : `${days} hari lagi`}</span>
                )}
              </>
            )}
          </p>
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError("");
                const result = await markReviewed([pageId]);
                if (!result.ok) return setError(result.error);
                setDone(true);
                const fresh = await getPageReview(pageId);
                if (fresh) setInfo(fresh);
              })
            }
          >
            <CheckCircle2 className="size-3.5" />
            Tandai sudah ditinjau
          </Button>
          {done && <p className="text-emerald-600 dark:text-emerald-400">Ditandai ditinjau.</p>}
        </div>
      ) : (
        <p className="text-xs text-fg-subtle">Jadwal tinjauan mulai dihitung saat halaman terbit. Menerbitkan juga dihitung sebagai tinjauan.</p>
      )}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </section>
  );
}
