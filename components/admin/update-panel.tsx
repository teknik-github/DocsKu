"use client";

import { useEffect, useState, useTransition } from "react";
import { ArrowUpCircle, Check, CheckCircle2, Copy, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { checkUpdates, saveUpdateSource } from "@/app/admin/_actions/updates";
import type { UpdatesView } from "@/lib/updates";
import { renderChatMarkdown } from "@/components/admin/editor/ai-client";
import { formatDateTime } from "@/components/admin/format";
import { copyText } from "@/lib/copy-text";
import { Alert, Button, Field, Input, Panel } from "@/components/admin/ui";

/** Installed version, whether GitHub has a newer release, its notes, and how to install it. */
export function UpdatePanel({ initial }: { initial: UpdatesView }) {
  const [view, setView] = useState(initial);
  const [checking, startCheck] = useTransition();
  const [saving, startSave] = useTransition();
  const [source, setSource] = useState({ repo: initial.repo, token: "", clearToken: false });
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  function check(ifStale = false) {
    startCheck(async () => {
      const result = await checkUpdates({ ifStale });
      if (result.ok) setView(result.view);
      else setMessage({ tone: "error", text: result.error });
    });
  }

  // Refresh a stale result once when the page opens; the server skips it if the last check is recent.
  useEffect(() => check(true), []);

  function save(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    startSave(async () => {
      const result = await saveUpdateSource(source);
      if (!result.ok) return setMessage({ tone: "error", text: result.error });
      setView(result.view);
      setSource({ repo: result.view.repo, token: "", clearToken: false });
      setMessage({ tone: "success", text: "Sumber pembaruan disimpan." });
    });
  }

  const result = view.check;
  const latest = result?.ok ? result.newer[0] : undefined;

  return (
    <Panel className="max-w-3xl space-y-5 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <ArrowUpCircle className="size-4 text-accent" />
            Pembaruan Docsku
          </h2>
          <p className="mt-1 text-xs text-fg-subtle">
            Versi terpasang <span className="font-mono text-fg">v{view.current}</span>. Rilis dibaca dari GitHub{" "}
            <span className="font-mono">{view.repo}</span>.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => check()} disabled={checking}>
          {checking ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          Periksa sekarang
        </Button>
      </div>

      {!result ? (
        <p className="text-sm text-fg-muted">{checking ? "Memeriksa rilis…" : "Belum pernah diperiksa."}</p>
      ) : !result.ok ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          {result.error} <span className="text-xs opacity-75">({formatDateTime(result.at)})</span>
        </p>
      ) : latest ? (
        <div className="space-y-4">
          <div className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:bg-sky-950/40 dark:text-sky-100" data-testid="update-available">
            Versi baru tersedia: <span className="font-mono font-medium">{latest.tag}</span>
            {result.newer.length > 1 && ` (${result.newer.length} rilis sejak versi Anda)`}.
          </div>
          <div className="space-y-2">
            {result.newer.map((release, i) => (
              <details key={release.tag} open={i === 0} className="rounded-lg border border-line">
                <summary className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span>
                    <span className="font-medium">{release.name}</span>
                    {release.publishedAt && <span className="ml-2 text-xs text-fg-subtle">{formatDateTime(release.publishedAt)}</span>}
                  </span>
                  <a href={release.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg">
                    GitHub <ExternalLink className="size-3" />
                  </a>
                </summary>
                {/* Release notes go through the same Markdown pipeline as AI Chat: raw HTML escaped, unsafe URLs dropped. */}
                <div
                  className="chat-prose border-t border-line px-3 py-2 text-sm text-fg-muted"
                  dangerouslySetInnerHTML={{ __html: release.notes ? renderChatMarkdown(release.notes) : "<p>Tanpa catatan rilis.</p>" }}
                />
              </details>
            ))}
          </div>
          <UpdateGuide tag={latest.tag} />
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-fg-muted" data-testid="up-to-date">
          <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
          {result.latest ? `Sudah versi terbaru (${result.latest.tag}).` : `Belum ada rilis di ${result.repo}.`}
          <span className="text-xs text-fg-subtle">Diperiksa {formatDateTime(result.at)}</span>
        </p>
      )}

      <details className="rounded-lg border border-line" open={!view.hasToken && result?.ok === false}>
        <summary className="cursor-pointer px-3 py-2 text-sm">Sumber pembaruan</summary>
        <form onSubmit={save} className="space-y-4 border-t border-line p-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Repositori GitHub" hint="pemilik/nama">
              <Input value={source.repo} onChange={(e) => setSource({ ...source, repo: e.target.value })} required />
            </Field>
            <Field
              label="Token GitHub"
              hint={
                view.tokenFromEnv
                  ? "Diambil dari UPDATE_GITHUB_TOKEN di env."
                  : view.hasToken
                    ? `Tersimpan (${view.tokenHint}). Kosongkan untuk mempertahankan; mengganti repositori menghapusnya.`
                    : "Untuk repositori private: fine-grained token dengan akses Contents read-only ke repositori ini."
              }
            >
              <Input
                type="password"
                autoComplete="off"
                value={source.token}
                onChange={(e) => setSource({ ...source, token: e.target.value })}
                disabled={view.tokenFromEnv}
                placeholder={view.hasToken ? "••••••••" : "github_pat_…"}
              />
            </Field>
          </div>
          {view.hasToken && !view.tokenFromEnv && (
            <label className="flex items-center gap-2 text-xs text-fg-muted">
              <input type="checkbox" checked={source.clearToken} onChange={(e) => setSource({ ...source, clearToken: e.target.checked })} />
              Hapus token yang tersimpan
            </label>
          )}
          {message && <Alert tone={message.tone}>{message.text}</Alert>}
          <Button type="submit" size="sm" disabled={saving}>
            Simpan &amp; periksa
          </Button>
        </form>
      </details>
    </Panel>
  );
}

function UpdateGuide({ tag }: { tag: string }) {
  const [copied, setCopied] = useState(false);
  const commands = `git fetch --tags origin\ngit checkout ${tag}\npnpm prod:deploy`;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Cara memperbarui</h3>
      <p className="text-xs text-fg-subtle">
        Jalankan di server, dari folder Docsku. Backup database dulu. <code>pnpm prod:deploy</code> membangun ulang image, menjalankan migrasi database, lalu
        memulai ulang aplikasi.
      </p>
      <div className="relative">
        <pre className="overflow-x-auto rounded-lg bg-fill px-3 py-2 pr-12 font-mono text-xs text-fg" data-testid="update-commands">
          {commands}
        </pre>
        <button
          type="button"
          onClick={async () => {
            if (await copyText(commands)) {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            }
          }}
          aria-label="Salin perintah"
          className="absolute top-1.5 right-1.5 inline-flex size-7 items-center justify-center rounded-md text-fg-muted hover:bg-surface hover:text-fg"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </button>
      </div>
    </div>
  );
}
