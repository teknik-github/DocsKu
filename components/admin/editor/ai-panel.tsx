"use client";

import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { Loader2, RotateCcw, Sparkles, Square, X } from "lucide-react";
import { AI_ACTIONS, type AiActionId } from "@/lib/ai/presets";
import { describeUsage, markdownToHtml, streamAi, type TokenUsage } from "@/components/admin/editor/ai-client";
import { Button } from "@/components/admin/ui";

/** What the AI panel works on: new text at a position, or a selected range. */
export type AiJob = {
  action: AiActionId;
  from: number;
  to: number;
  /** Markdown of the selection, for rewrite actions. */
  selection?: string;
  /** Selection lies within one paragraph, so the result replaces it inline. */
  inline?: boolean;
};

const LABELS: Record<string, string> = {
  write: "Tulis dengan AI",
  custom: "Instruksi untuk teks terpilih",
  ...Object.fromEntries(AI_ACTIONS.map((a) => [a.id, a.label])),
};

const needsInstruction = (action: AiActionId) => action === "write" || action === "custom";

export function AiPanel({
  editor,
  job,
  context,
  onClose,
}: {
  editor: Editor;
  job: AiJob;
  context: () => { title: string; description: string; document: string };
  onClose: () => void;
}) {
  const [instruction, setInstruction] = useState("");
  const [result, setResult] = useState("");
  const [status, setStatus] = useState<"idle" | "thinking" | "streaming" | "done" | "error">(
    needsInstruction(job.action) ? "idle" : "streaming",
  );
  const [error, setError] = useState("");
  const [cost, setCost] = useState<{ cached: boolean; usage?: TokenUsage } | null>(null);
  const abort = useRef<AbortController | null>(null);
  // Keep the target range valid while the document changes underneath.
  const range = useRef({ from: job.from, to: job.to });

  useEffect(() => {
    const onTransaction = ({ transaction }: { transaction: { mapping: { map: (pos: number, assoc?: number) => number } } }) => {
      range.current = {
        from: transaction.mapping.map(range.current.from, -1),
        to: transaction.mapping.map(range.current.to, 1),
      };
    };
    editor.on("transaction", onTransaction);
    return () => {
      editor.off("transaction", onTransaction);
    };
  }, [editor]);

  /** Streams one answer. Only sets state after awaiting, so it can start from an effect. */
  async function stream(fresh = false) {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    // Ignore updates from a request that a newer one has replaced.
    const current = () => abort.current === controller;
    try {
      await streamAi(
        { action: job.action, instruction, selection: job.selection, inline: job.inline, fresh, ...context() },
        {
          signal: controller.signal,
          onCached: () => current() && setCost({ cached: true }),
          onUsage: (usage) => current() && setCost({ cached: false, usage }),
          onThinking: () => current() && setStatus("thinking"),
          onText: (text) => {
            if (!current()) return;
            setStatus("streaming");
            setResult(text);
          },
        },
      );
      if (current()) setStatus("done");
    } catch (e) {
      if (!current()) return;
      if (controller.signal.aborted) {
        setStatus("done");
        return;
      }
      setError((e as Error).message);
      setStatus("error");
    }
  }

  /** `fresh` skips the answer cache ("Coba lagi" wants a different answer). */
  function generate(fresh = false) {
    if (needsInstruction(job.action) && !instruction.trim()) return;
    setResult("");
    setError("");
    setCost(null);
    setStatus("streaming");
    void stream(fresh);
  }

  // Preset rewrites start as soon as the panel opens; any request stops when it closes.
  useEffect(() => {
    // stream() only sets state once the network responds, never synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!needsInstruction(job.action)) void stream();
    return () => abort.current?.abort();
    // Runs once per panel; the panel is keyed by job, so a new job remounts it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Closes without changes, giving the editor back its focus and the original selection. */
  function dismiss() {
    const { from, to } = range.current;
    const size = editor.state.doc.content.size;
    editor.chain().focus().setTextSelection({ from: Math.min(from, size), to: Math.min(to, size) }).run();
    onClose();
  }

  function apply(mode: "replace" | "below" | "insert") {
    const { from, to } = range.current;
    const chain = editor.chain().focus();
    if (mode === "replace") {
      chain.insertContentAt({ from, to }, markdownToHtml(result, job.inline)).run();
    } else if (mode === "below") {
      const $to = editor.state.doc.resolve(to);
      chain.insertContentAt($to.after($to.depth), markdownToHtml(result)).run();
    } else {
      // Replace the empty line the "/ai" command was typed on.
      const $pos = editor.state.doc.resolve(from);
      const emptyLine = $pos.parent.isTextblock && $pos.parent.content.size === 0;
      const target = emptyLine ? { from: $pos.before(), to: $pos.after() } : from;
      chain.insertContentAt(target, markdownToHtml(result)).run();
    }
    onClose();
  }

  const busy = status === "streaming" || status === "thinking";

  return (
    <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <div className="flex max-h-[60vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
        <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
          <Sparkles className="size-4 text-accent" />
          <span className="text-sm font-medium">{LABELS[job.action] ?? "AI"}</span>
          {status === "thinking" && <span className="text-xs text-fg-subtle">Berpikir…</span>}
          <button type="button" onClick={dismiss} aria-label="Tutup" className="ml-auto inline-flex size-7 items-center justify-center rounded-md hover:bg-fill">
            <X className="size-4" />
          </button>
        </div>

        {needsInstruction(job.action) && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              generate();
            }}
            className="flex gap-2 border-b border-line p-3"
          >
            <textarea
              autoFocus
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  generate();
                }
                if (e.key === "Escape") dismiss();
              }}
              rows={2}
              placeholder={
                job.action === "write"
                  ? "Mis. “Jelaskan cara instalasi dengan pnpm dan npm, lengkap dengan contoh kode”"
                  : "Mis. “Ubah menjadi daftar berpoin”"
              }
              className="min-h-14 flex-1 resize-none rounded-lg border border-line bg-page px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <Button type="submit" variant="accent" disabled={busy || !instruction.trim()} className="self-end">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              Buat
            </Button>
          </form>
        )}

        {(result || busy || error) && (
          <div className="min-h-16 flex-1 overflow-y-auto px-4 py-3">
            {error ? (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            ) : (
              <div className="text-sm leading-relaxed whitespace-pre-wrap text-fg">
                {result}
                {busy && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-accent align-middle" />}
              </div>
            )}
          </div>
        )}

        {(busy || status === "done" || status === "error") && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2.5">
            {busy ? (
              <Button size="sm" variant="secondary" onClick={() => abort.current?.abort()}>
                <Square className="size-3" />
                Hentikan
              </Button>
            ) : (
              <>
                {status === "done" && result && job.action === "write" && (
                  <Button size="sm" variant="accent" onClick={() => apply("insert")}>
                    Sisipkan
                  </Button>
                )}
                {status === "done" && result && job.action !== "write" && (
                  <>
                    <Button size="sm" variant="accent" onClick={() => apply("replace")}>
                      Ganti pilihan
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => apply("below")}>
                      Sisipkan di bawah
                    </Button>
                  </>
                )}
                <Button size="sm" variant="ghost" onClick={() => generate(true)}>
                  <RotateCcw className="size-3.5" />
                  Coba lagi
                </Button>
                <Button size="sm" variant="ghost" onClick={dismiss}>
                  Buang
                </Button>
              </>
            )}
            <span className="ml-auto text-[11px] text-fg-subtle">
              {cost?.cached ? "Dari cache · 0 token" : cost?.usage ? describeUsage(cost.usage) : "Periksa kembali hasil AI sebelum diterbitkan."}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
