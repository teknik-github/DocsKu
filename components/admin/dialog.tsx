"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, HelpCircle, KeyRound } from "lucide-react";
import { buttonClass, inputClass } from "@/components/admin/ui";

/**
 * Dashboard confirm and prompt dialogs, in place of the browser's own
 * confirm()/prompt(). Call `await confirmDialog({...})` anywhere in a client
 * component; <DialogHost /> (mounted once in app/admin/layout.tsx) shows them
 * one at a time.
 */

type Options = {
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" for deleting and other things that can't be undone. */
  tone?: "default" | "danger";
};
type PromptOptions = Options & {
  label: string;
  type?: "text" | "password";
  placeholder?: string;
  minLength?: number;
};
type Request = { id: number } & (
  | ({ kind: "confirm"; resolve: (ok: boolean) => void } & Options)
  | ({ kind: "prompt"; resolve: (value: string | null) => void } & PromptOptions)
);

const queue: Request[] = [];
let nextId = 1;
let notify: (() => void) | null = null;

function enqueue(request: Request) {
  queue.push(request);
  if (notify) notify();
  else {
    // No host mounted: fall back to the browser's dialogs rather than hang.
    queue.pop();
    if (request.kind === "confirm") request.resolve(window.confirm(request.title));
    else request.resolve(window.prompt(request.label));
  }
}

export function confirmDialog(options: Options): Promise<boolean> {
  return new Promise((resolve) => enqueue({ id: nextId++, kind: "confirm", resolve, ...options }));
}

export function promptDialog(options: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => enqueue({ id: nextId++, kind: "prompt", resolve, ...options }));
}

export function DialogHost() {
  const [current, setCurrent] = useState<Request | null>(null);

  useEffect(() => {
    notify = () => setCurrent((shown) => shown ?? queue[0] ?? null);
    notify();
    return () => {
      notify = null;
    };
  }, []);

  if (!current) return null;
  const close = (result: boolean | string | null) => {
    queue.shift();
    if (current.kind === "confirm") current.resolve(result === true);
    else current.resolve(typeof result === "string" ? result : null);
    setCurrent(queue[0] ?? null);
  };
  return <DialogView key={current.id} request={current} onClose={close} />;
}

function DialogView({ request, onClose }: { request: Request; onClose: (result: boolean | string | null) => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  const danger = request.tone === "danger";
  const Icon = request.kind === "prompt" ? (request.type === "password" ? KeyRound : HelpCircle) : danger ? AlertTriangle : HelpCircle;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    // A destructive action never confirms on a stray Enter: focus "Batal" first.
    (request.kind === "prompt" ? inputRef : danger ? cancelRef : confirmRef).current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
    // Once per dialog (it is keyed by request id).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (request.kind === "confirm") return onClose(true);
    if (request.minLength && value.length < request.minLength) return setError(`Minimal ${request.minLength} karakter.`);
    onClose(value);
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]" onMouseDown={() => onClose(null)}>
      <form
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="docsku-dialog-title"
        aria-describedby={request.message ? "docsku-dialog-message" : undefined}
        onSubmit={submit}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-line bg-surface p-5 shadow-2xl"
      >
        <div className="flex gap-3.5">
          <span
            className={`flex size-9 shrink-0 items-center justify-center rounded-full ${
              danger ? "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400" : "bg-accent-soft text-accent"
            }`}
          >
            <Icon className="size-4.5" />
          </span>
          <div className="min-w-0 flex-1 pt-1">
            <h2 id="docsku-dialog-title" className="text-sm font-semibold text-fg">
              {request.title}
            </h2>
            {request.message && (
              <div id="docsku-dialog-message" className="mt-1.5 text-sm leading-relaxed text-fg-muted">
                {request.message}
              </div>
            )}
            {request.kind === "prompt" && (
              <label className="mt-4 block">
                <span className="mb-1.5 block text-xs font-medium text-fg">{request.label}</span>
                <input
                  ref={inputRef}
                  type={request.type ?? "text"}
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value);
                    setError("");
                  }}
                  placeholder={request.placeholder}
                  autoComplete={request.type === "password" ? "new-password" : "off"}
                  className={inputClass}
                />
                {error && <span className="mt-1 block text-xs text-red-600 dark:text-red-400">{error}</span>}
              </label>
            )}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={() => onClose(null)} className={buttonClass("secondary", "sm")}>
            {request.cancelLabel ?? "Batal"}
          </button>
          <button
            ref={confirmRef}
            type="submit"
            disabled={request.kind === "prompt" && !value}
            className={
              danger
                ? "inline-flex h-8 items-center justify-center rounded-lg bg-red-600 px-3 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                : buttonClass("accent", "sm")
            }
          >
            {request.confirmLabel ?? "Lanjutkan"}
          </button>
        </div>
      </form>
    </div>
  );
}
