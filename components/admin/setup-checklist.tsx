"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, ChevronRight, Rocket, X } from "lucide-react";

export type SetupStep = { label: string; hint: string; href: string; done: boolean };

const KEY = "docsku:setup-dismissed";

/**
 * "Langkah awal" on the dashboard (admins, while something is left). Hidden
 * until mounted so a dismissed list never flashes; dismissing is per browser.
 */
export function SetupChecklist({ steps }: { steps: SetupStep[] }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(KEY) === "1";
    } catch {}
    // Reading localStorage is the external system here; showing after mount avoids a flash.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!dismissed) setShow(true);
  }, []);

  const done = steps.filter((s) => s.done).length;
  if (!show || done === steps.length) return null;

  return (
    <section aria-label="Langkah awal" className="mb-6 rounded-xl border border-line bg-surface p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <Rocket className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-fg">Langkah awal</h2>
          <p className="text-xs text-fg-muted">
            {done} dari {steps.length} selesai
          </p>
          <div className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-fill">
            <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${(done / steps.length) * 100}%` }} />
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            try {
              localStorage.setItem(KEY, "1");
            } catch {}
            setShow(false);
          }}
          aria-label="Sembunyikan langkah awal"
          title="Sembunyikan"
          className="inline-flex size-7 items-center justify-center rounded-md text-fg-subtle hover:bg-fill hover:text-fg"
        >
          <X className="size-4" />
        </button>
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((step) => (
          <li key={step.label}>
            <Link
              href={step.href}
              className={`group flex items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors ${
                step.done ? "border-line bg-page" : "border-line bg-page hover:border-accent"
              }`}
            >
              <span
                className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border ${
                  step.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-line-strong"
                }`}
              >
                {step.done && <Check className="size-3" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm ${step.done ? "text-fg-subtle line-through" : "font-medium text-fg"}`}>{step.label}</span>
                {!step.done && <span className="block text-xs text-fg-subtle">{step.hint}</span>}
              </span>
              {!step.done && <ChevronRight className="mt-0.5 size-4 shrink-0 text-fg-subtle group-hover:text-accent" />}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
