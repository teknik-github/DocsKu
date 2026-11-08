"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { useSite } from "@/components/site-context";
import { t } from "@/lib/i18n";
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
  // Placed where the article body ends: how far the reader scrolled is measured against it.
  const end = useRef<HTMLDivElement>(null);
  useReadingTracker(slug, end);
  useEffect(() => {
    const session = storage("session");
    const key = `docsku:view:${slug}`;
    if (session?.getItem(key)) return;
    session?.setItem(key, "1");
    beacon("/api/track", { type: "view", slug });
  }, [slug]);

  return (
    <>
      <div ref={end} aria-hidden="true" />
      <PageFeedback key={slug} slug={slug} />
      <PageComments key={`comments:${slug}`} slug={slug} />
    </>
  );
}

/**
 * One "read" per visit of an article, sent when the reader moves to another
 * page (exit: false) or leaves the site, closes or reloads the tab (pagehide,
 * exit: true): the furthest point reached as a percentage of the article, and
 * the seconds the tab was visible. Nothing identifies the reader.
 */
function useReadingTracker(slug: string, end: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    let depth = 0;
    let visibleMs = 0;
    let since: number | null = document.visibilityState === "visible" ? performance.now() : null;
    let sent = false;
    let frame = 0;

    const measure = () => {
      frame = 0;
      const marker = end.current;
      if (!marker) return;
      const articleEnd = marker.getBoundingClientRect().top + window.scrollY;
      const seen = window.scrollY + window.innerHeight;
      const reached = articleEnd <= 0 ? 100 : Math.min(100, Math.round((seen / articleEnd) * 100));
      if (reached > depth) depth = reached;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const pause = () => {
      if (since !== null) visibleMs += performance.now() - since;
      since = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") pause();
      else if (since === null) since = performance.now();
    };
    const send = (exit: boolean) => {
      if (sent) return;
      pause();
      const seconds = Math.round(visibleMs / 1000);
      // A visit under a second is a bounce through the page (or React's dev double mount), not a read.
      if (seconds < 1) return;
      sent = true;
      const body = { type: "read", slug, depth, seconds, exit };
      // While the page unloads, sendBeacon is the request browsers reliably deliver. A plain string
      // (text/plain) keeps it a simple request; the endpoint reads the body as JSON either way.
      try {
        if (exit && typeof navigator.sendBeacon === "function" && navigator.sendBeacon("/api/track", JSON.stringify(body))) return;
      } catch {
        // Fall through to fetch.
      }
      beacon("/api/track", body);
    };
    const onPageHide = () => send(true);

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
      if (frame) cancelAnimationFrame(frame);
      send(false);
    };
  }, [slug, end]);
}

type Step = { name: "ask" } | { name: "message"; id: string; helpful: boolean } | { name: "done" };

function PageFeedback({ slug }: { slug: string }) {
  const { locale } = useSite();
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
    if (!data?.id) return setError(t(locale, "feedbackError"));
    storage("local")?.setItem(key, "1");
    setStep({ name: "message", id: data.id, helpful });
  }

  async function send(id: string) {
    if (!message.trim()) return finish();
    setBusy(true);
    setError("");
    const response = await beacon("/api/feedback", { id, comment: message.trim() });
    setBusy(false);
    if (!response?.ok) return setError(t(locale, "messageError"));
    finish();
  }

  const done = step.name === "done" || (answered && step.name === "ask");
  return (
    <section aria-label={t(locale, "feedbackLabel")} data-testid="page-feedback" className="not-prose mt-16 rounded-xl border border-line bg-surface/60 px-5 py-4">
      {done ? (
        <p className="flex items-center gap-2 text-sm text-fg-muted">
          <Check className="size-4 text-accent" />
          {t(locale, "thanksDone")}
        </p>
      ) : step.name === "ask" ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-fg">{t(locale, "helpful")}</p>
          <div className="flex gap-2">
            {[
              { helpful: true, label: t(locale, "yes"), Icon: ThumbsUp },
              { helpful: false, label: t(locale, "no"), Icon: ThumbsDown },
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
            {t(locale, step.helpful ? "thanksHelpful" : "thanksNotHelpful")}
          </label>
          <textarea
            id={`feedback-${slug}`}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={1000}
            rows={3}
            placeholder={t(locale, "optional")}
            className="mt-2 w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg outline-none placeholder:text-fg-subtle focus:border-line-strong"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-fg-subtle">{t(locale, "feedbackPrivate")}</p>
            <div className="flex gap-2">
              <button type="button" onClick={finish} className="h-8 rounded-lg px-3 text-sm text-fg-muted hover:bg-fill hover:text-fg">
                {t(locale, "skip")}
              </button>
              <button type="submit" disabled={busy} className="h-8 rounded-lg bg-fg px-3 text-sm font-medium text-page hover:opacity-85 disabled:opacity-50">
                {t(locale, "send")}
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
