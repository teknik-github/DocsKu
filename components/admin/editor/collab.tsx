"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, MessageSquareWarning, RefreshCw, Send, Undo2 } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { buttonClass } from "@/components/admin/ui";
import type { ApprovalInfo } from "@/lib/collab/approval";

/**
 * Collaboration pieces of the page editor: who else has the page open
 * (heartbeat to /admin/api/presence), the conflict banner when someone saved
 * in between, and the approval workflow controls.
 */

export type Conflict = { version: number; by: string | null; at: string };
export type PresencePerson = { userId: string; name: string; avatar: string | null; self: boolean };

const HEARTBEAT_MS = 20_000;

const time = (iso: string) => new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso));

/**
 * Sends a heartbeat every 20 s (and when the tab becomes visible again) and
 * says goodbye with sendBeacon when the tab closes. `onVersion` gets the
 * server's working-copy version with every heartbeat.
 */
export function usePresence(pageId: string, onVersion: (version: Conflict) => void) {
  const [others, setOthers] = useState<PresencePerson[]>([]);
  const callback = useRef(onVersion);
  useEffect(() => {
    callback.current = onVersion;
  });

  useEffect(() => {
    const tabId = crypto.randomUUID();
    const url = "/admin/api/presence";
    let alive = true;
    async function beat() {
      if (document.visibilityState === "hidden") return;
      try {
        const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pageId, tabId }) });
        if (!response.ok || !alive) return;
        const data = (await response.json()) as { others: PresencePerson[]; version: Conflict };
        setOthers(data.others);
        callback.current(data.version);
      } catch {
        // Offline for a moment: the next beat tries again.
      }
    }
    function leave() {
      navigator.sendBeacon(url, new Blob([JSON.stringify({ pageId, tabId, leave: true })], { type: "application/json" }));
    }
    function onVisible() {
      if (document.visibilityState === "visible") void beat();
    }
    void beat();
    const timer = window.setInterval(beat, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("pagehide", leave);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [pageId]);

  return others;
}

/** "Sari sedang mengedit halaman ini", with avatars, in the editor header. */
export function PresenceAvatars({ others }: { others: PresencePerson[] }) {
  if (!others.length) return null;
  const people = others.filter((p) => !p.self);
  const selfElsewhere = others.some((p) => p.self);
  const names = people.map((p) => p.name);
  const label = [
    names.length === 1 ? `${names[0]} sedang mengedit halaman ini` : names.length > 1 ? `${names.slice(0, -1).join(", ")} dan ${names.at(-1)} sedang mengedit halaman ini` : "",
    selfElsewhere ? "Halaman ini juga terbuka di tab lain Anda" : "",
  ]
    .filter(Boolean)
    .join(". ");
  return (
    <span className="flex min-w-0 items-center gap-1.5" title={label} role="status" aria-label={label} data-testid="presence">
      <span className="flex -space-x-1.5">
        {people.slice(0, 3).map((p) => (
          <Avatar key={p.userId} name={p.name} src={p.avatar} size={22} className="ring-2 ring-page" />
        ))}
        {selfElsewhere && !people.length && (
          <span className="inline-flex size-[22px] items-center justify-center rounded-full bg-amber-100 text-[10px] font-semibold text-amber-800 ring-2 ring-page dark:bg-amber-950 dark:text-amber-200">2</span>
        )}
      </span>
      <span className="hidden truncate text-xs text-amber-700 lg:inline dark:text-amber-300">
        {people.length ? (people.length === 1 ? `${people[0].name} juga mengedit` : `${people.length} orang juga mengedit`) : "Terbuka di tab lain"}
      </span>
    </span>
  );
}

/**
 * Shown when a save was refused because someone saved in between (`mode="conflict"`),
 * or when the heartbeat reports a newer version than the one being edited (`mode="stale"`).
 */
export function ConflictBanner({
  conflict,
  mode,
  busy,
  onReload,
  onOverwrite,
  onDismiss,
}: {
  conflict: Conflict;
  mode: "conflict" | "stale";
  busy: boolean;
  onReload: () => void;
  onOverwrite: () => void;
  onDismiss?: () => void;
}) {
  const who = conflict.by ?? "Orang lain";
  return (
    <div role="alert" data-testid="conflict-banner" className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-2">
        <AlertTriangle className="size-4 shrink-0" />
        <p className="min-w-0 flex-1">
          {mode === "conflict" ? (
            <>
              <strong>Halaman ini diubah oleh {who} pada {time(conflict.at)}.</strong> Perubahan Anda belum disimpan agar tidak menimpa versi mereka.
            </>
          ) : (
            <>
              <strong>{who} menyimpan versi baru pada {time(conflict.at)}.</strong> Muat versi itu sebelum melanjutkan supaya tidak saling menimpa.
            </>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onReload} disabled={busy} className={buttonClass("secondary", "sm")}>
            <RefreshCw className="size-3.5" />
            Muat versi terbaru
          </button>
          {mode === "conflict" ? (
            <button type="button" onClick={onOverwrite} disabled={busy} className={buttonClass("ghost", "sm")}>
              Timpa dengan versi saya
            </button>
          ) : (
            onDismiss && (
              <button type="button" onClick={onDismiss} disabled={busy} className={buttonClass("ghost", "sm")}>
                Abaikan
              </button>
            )
          )}
        </div>
      </div>
      {mode === "conflict" && (
        <p className="mx-auto mt-1 max-w-5xl pl-7 text-xs text-amber-800/80 dark:text-amber-200/70">
          &quot;Muat versi terbaru&quot; menyimpan salinan Anda di Riwayat revisi dulu. &quot;Timpa&quot; menyimpan versi mereka di Riwayat sebelum menimpanya.
        </p>
      )}
    </div>
  );
}

/** The approval request's state as a banner under the header. */
export function ApprovalBanner({
  approval,
  canApprove,
  busy,
  onApprove,
  onRequestChanges,
}: {
  approval: NonNullable<ApprovalInfo>;
  canApprove: boolean;
  busy: boolean;
  onApprove: () => void;
  onRequestChanges: () => void;
}) {
  if (approval.status === "changes_requested") {
    return (
      <div data-testid="approval-banner" className="border-b border-orange-200 bg-orange-50 px-4 py-2.5 text-sm text-orange-900 dark:border-orange-900/60 dark:bg-orange-950/40 dark:text-orange-100">
        <div className="mx-auto flex max-w-5xl items-start gap-2">
          <MessageSquareWarning className="mt-0.5 size-4 shrink-0" />
          <p>
            <strong>Peninjau meminta perubahan.</strong> {approval.note}
            <span className="block text-xs opacity-80">Perbaiki halamannya, lalu ajukan lagi untuk ditinjau.</span>
          </p>
        </div>
      </div>
    );
  }
  const when = approval.requestedAt ? time(approval.requestedAt) : "";
  return (
    <div data-testid="approval-banner" className="border-b border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-100">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-2">
        <Clock className="size-4 shrink-0" />
        <p className="min-w-0 flex-1">
          {canApprove ? (
            <>
              <strong>Diajukan oleh {approval.requestedBy ?? "kontributor"}</strong>
              {when && ` pukul ${when}`} untuk ditinjau.
              {approval.note && <span className="block text-xs opacity-80">Catatan: {approval.note}</span>}
            </>
          ) : (
            <>
              <strong>Menunggu persetujuan editor.</strong> Anda masih bisa menyunting; peninjau melihat versi terakhir yang tersimpan.
            </>
          )}
        </p>
        {canApprove && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onApprove} disabled={busy} className={buttonClass("accent", "sm")}>
              <CheckCircle2 className="size-3.5" />
              Setujui &amp; terbitkan
            </button>
            <button type="button" onClick={onRequestChanges} disabled={busy} className={buttonClass("secondary", "sm")}>
              Minta perubahan
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Replaces "Terbitkan" for contributors: submit for approval, or withdraw a pending request. */
export function SubmitButton({ pending, busy, onSubmit, onWithdraw }: { pending: boolean; busy: boolean; onSubmit: () => void; onWithdraw: () => void }) {
  if (pending) {
    return (
      <button type="button" onClick={onWithdraw} disabled={busy} className={buttonClass("secondary", "sm")} title="Batalkan pengajuan">
        <Undo2 className="size-3.5" />
        <span className="hidden sm:inline">Batalkan pengajuan</span>
        <span className="sm:hidden">Batalkan</span>
      </button>
    );
  }
  return (
    <button type="button" onClick={onSubmit} disabled={busy} className={buttonClass("accent", "sm")}>
      <Send className="size-3.5" />
      <span className="hidden sm:inline">Ajukan untuk ditinjau</span>
      <span className="sm:hidden">Ajukan</span>
    </button>
  );
}
