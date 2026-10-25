"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Check, ThumbsDown, ThumbsUp } from "lucide-react";
import { PageComments } from "@/components/page-comments";

/** Fire-and-forget POST to a public stats endpoint. */
export function beacon(url: string, body: unknown) {
  return fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), keepalive: true }).catch(() => null);
}

function storage(kind: "local" | "session") {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null; // Storage can be blocked (privacy settings, sandboxed frames).
  }
}

const subscribe = (onChange: () => void) => {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
};

/**
 * End-of-article block for published doc pages: counts one view per tab
 * (no cookies) and asks whether the page helped, with an optional message
 * that only the dashboard shows, followed by the public comments.
 */
export function ReaderFooter({ slug }: { slug: string }) {
  useEffect(() => {
    const session = storage("session");
    const key = `docsku:view:${slug}`;
    if (session?.getItem(key)) return;
    session?.setItem(key, "1");
    beacon("/api/track", { type: "view", slug });
  }, [slug]);

  return (
    <>
      <PageFeedback key={slug} slug={slug} />
      <PageComments key={`comments:${slug}`} slug={slug} />
    </>
  );
}

type Step = { name: "ask" } | { name: "message"; id: string; helpful: boolean } | { name: "done" };

function PageFeedback({ slug }: { slug: string }) {
  const key = `docsku:feedback:${slug}`;
  const answered = useSyncExternalStore(subscribe, () => Boolean(storage("local")?.getItem(key)), () => false);
  const [step, setStep] = useState<Step>({ name: "ask" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function finish() {
    storage("local")?.setItem(key, "1");
    setStep({ name: "done" });
  }

  async function vote(helpful: boolean) {
    setBusy(true);
    setError("");
    const response = await beacon("/api/feedback", { slug, helpful });
    setBusy(false);
    const data = response?.ok ? ((await response.json().catch(() => null)) as { id?: string } | null) : null;
    if (!data?.id) return setError("Masukan belum terkirim. Coba lagi sebentar lagi.");
    storage("local")?.setItem(key, "1");
    setStep({ name: "message", id: data.id, helpful });
  }

  async function send(id: string) {
    if (!message.trim()) return finish();
    setBusy(true);
    setError("");
    const response = await beacon("/api/feedback", { id, comment: message.trim() });
    setBusy(false);
    if (!response?.ok) return setError("Pesan belum terkirim. Coba lagi sebentar lagi.");
    finish();
  }

  const done = step.name === "done" || (answered && step.name === "ask");
  return (
    <section aria-label="Masukan" data-testid="page-feedback" className="not-prose mt-16 rounded-xl border border-line bg-surface/60 px-5 py-4">
      {done ? (
        <p className="flex items-center gap-2 text-sm text-fg-muted">
          <Check className="size-4 text-accent" />
          Terima kasih atas masukan Anda.
        </p>
      ) : step.name === "ask" ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-fg">Apakah halaman ini membantu?</p>
          <div className="flex gap-2">
            {[
              { helpful: true, label: "Ya", Icon: ThumbsUp },
              { helpful: false, label: "Tidak", Icon: ThumbsDown },
            ].map(({ helpful, label, Icon }) => (
              <button
                key={label}
                type="button"
                disabled={busy}
                onClick={() => vote(helpful)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm text-fg-muted transition-colors hover:border-line-strong hover:text-fg disabled:opacity-50"
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            send(step.id);
          }}
        >
          <label htmlFor={`feedback-${slug}`} className="block text-sm font-medium text-fg">
            {step.helpful ? "Terima kasih! Bagian apa yang paling membantu?" : "Terima kasih! Apa yang kurang atau perlu diperbaiki?"}
          </label>
          <textarea
            id={`feedback-${slug}`}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="Opsional"
            className="mt-2 w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg outline-none placeholder:text-fg-subtle focus:border-line-strong"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-fg-subtle">Pesan hanya dibaca oleh tim dokumentasi, tidak ditampilkan di situs.</p>
            <div className="flex gap-2">
              <button type="button" onClick={finish} className="h-8 rounded-lg px-3 text-sm text-fg-muted hover:bg-fill hover:text-fg">
                Lewati
              </button>
              <button type="submit" disabled={busy} className="h-8 rounded-lg bg-fg px-3 text-sm font-medium text-page hover:opacity-85 disabled:opacity-50">
                Kirim
              </button>
            </div>
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </section>
  );
}
