"use client";

import { useEffect, useRef, useState } from "react";
import { HelpCircle } from "lucide-react";
import { useSite } from "@/components/site-context";
import { t } from "@/lib/i18n";

/**
 * Select a passage of the article, then "Bagian ini membingungkan?": the passage
 * (and an optional message) goes to the team as an internal note on the page
 * (POST /api/section-feedback). Only text inside the article body counts.
 */

const MIN = 3;
const MAX = 300;
/** Article bodies in every layout use a prose-* class. */
const BODY = '[class*="prose-"]';

type Spot = { quote: string; top: number; left: number };
type Step = "button" | "form" | "sending" | "sent" | "error";

function selectedPassage(): Spot | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const text = selection.toString().replace(/\s+/g, " ").trim();
  if (text.length < MIN) return null;
  const range = selection.getRangeAt(0);
  const start = range.startContainer.nodeType === 1 ? (range.startContainer as Element) : range.startContainer.parentElement;
  if (!start?.closest(BODY) || start.closest("[data-section-feedback], input, textarea, [contenteditable='true']")) return null;
  const rect = range.getBoundingClientRect();
  if (!rect.width && !rect.height) return null;
  return {
    quote: text.slice(0, MAX),
    top: rect.bottom + window.scrollY + 8,
    left: Math.min(Math.max(rect.left + window.scrollX + rect.width / 2, 140), window.scrollX + document.documentElement.clientWidth - 140),
  };
}

export function SectionFeedback({ slug }: { slug: string }) {
  const { locale } = useSite();
  const [spot, setSpot] = useState<Spot | null>(null);
  const [step, setStep] = useState<Step>("button");
  const [message, setMessage] = useState("");
  const stepRef = useRef(step);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  useEffect(() => {
    let timer = 0;
    const update = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        // Keep an open form even when the selection goes away (typing in it clears it).
        if (stepRef.current !== "button") return;
        setSpot(selectedPassage());
      }, 200);
    };
    document.addEventListener("selectionchange", update);
    return () => {
      document.removeEventListener("selectionchange", update);
      window.clearTimeout(timer);
    };
  }, []);

  function close() {
    setSpot(null);
    setStep("button");
    setMessage("");
  }

  async function send() {
    if (!spot) return;
    setStep("sending");
    const res = await fetch("/api/section-feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug, quote: spot.quote, message, website: "" }),
    }).catch(() => null);
    if (res?.ok || res?.status === 204) {
      setStep("sent");
      window.getSelection()?.removeAllRanges();
      window.setTimeout(close, 3500);
    } else setStep("error");
  }

  if (!spot) return null;
  return (
    <div
      data-section-feedback
      role={step === "button" ? undefined : "dialog"}
      aria-label={t(locale, "sectionConfusing")}
      style={{ top: spot.top, left: spot.left }}
      className="absolute z-40 -translate-x-1/2"
      onMouseDown={(e) => {
        // Clicking the button must not clear the selection first.
        if (step === "button") e.preventDefault();
      }}
    >
      {step === "button" ? (
        <button
          type="button"
          onClick={() => setStep("form")}
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-fg shadow-lg hover:border-line-strong"
        >
          <HelpCircle className="size-3.5 text-accent" />
          {t(locale, "sectionConfusing")}
        </button>
      ) : (
        <div className="w-72 rounded-xl border border-line bg-surface p-3 text-left shadow-xl">
          {step === "sent" ? (
            <p role="status" className="text-sm text-fg">
              {t(locale, "sectionThanks")}
            </p>
          ) : (
            <>
              <blockquote className="mb-2 line-clamp-3 border-l-2 border-accent pl-2 text-xs text-fg-muted italic">“{spot.quote}”</blockquote>
              <textarea
                autoFocus
                value={message}
                maxLength={500}
                rows={3}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") close();
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void send();
                }}
                placeholder={t(locale, "sectionWhat")}
                aria-label={t(locale, "sectionWhat")}
                className="w-full resize-none rounded-lg border border-line bg-page px-2.5 py-2 text-sm text-fg outline-none focus:border-accent"
              />
              {step === "error" && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{t(locale, "sectionError")}</p>}
              <div className="mt-2 flex justify-end gap-2">
                <button type="button" onClick={close} className="rounded-md px-2.5 py-1 text-xs text-fg-muted hover:bg-fill">
                  {t(locale, "sectionCancel")}
                </button>
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={step === "sending"}
                  className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white hover:bg-accent-strong disabled:opacity-60"
                >
                  {t(locale, "sectionSend")}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
