"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Plus, RotateCw, Send, Trash2, Webhook } from "lucide-react";
import { createWebhook, deleteWebhook, redeliver, testWebhook, updateWebhook } from "@/app/admin/_actions/notifications";
import { confirmDialog } from "@/components/admin/dialog";
import { Alert, Button, Field, Input, Panel, Select } from "@/components/admin/ui";
import { WEBHOOK_EVENTS, WEBHOOK_KINDS, type WebhookEventKey, type WebhookKind } from "@/lib/notifications/catalog";
import type { DeliveryView, WebhookView } from "@/lib/notifications/admin";

const KIND_LABEL = Object.fromEntries(WEBHOOK_KINDS.map((k) => [k.id, k.label])) as Record<WebhookKind, string>;
const EVENT_LABEL = Object.fromEntries(WEBHOOK_EVENTS.map((e) => [e.key, e.label])) as Record<string, string>;
const STATUS = {
  delivered: { label: "Terkirim", className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
  pending: { label: "Menunggu", className: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" },
  sending: { label: "Mengirim", className: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" },
  failed: { label: "Gagal", className: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300" },
  skipped: { label: "Dilewati", className: "bg-fill text-fg-muted" },
} as Record<string, { label: string; className: string }>;

const time = (iso: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso));

function EventChecks({ value, onChange }: { value: WebhookEventKey[]; onChange: (v: WebhookEventKey[]) => void }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-fg">Kejadian</legend>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {WEBHOOK_EVENTS.map((event) => (
          <label key={event.key} className="flex items-center gap-2 text-sm text-fg-muted">
            <input
              type="checkbox"
              className="accent-accent"
              checked={value.includes(event.key)}
              onChange={(e) => onChange(e.target.checked ? [...value, event.key] : value.filter((k) => k !== event.key))}
            />
            {event.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Pengaturan → Webhook: Slack, Discord, Telegram or a custom URL, with recent deliveries. */
export function WebhooksPanel({ hooks, deliveries, canEncrypt }: { hooks: WebhookView[]; deliveries: DeliveryView[]; canEncrypt: boolean }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", kind: "slack" as WebhookKind, target: "", chat: "", secret: "", events: ["page.published", "comment.new"] as WebhookEventKey[] });
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const kindInfo = WEBHOOK_KINDS.find((k) => k.id === draft.kind)!;

  function run(action: () => Promise<{ ok: boolean; error?: string } | { ok: true }>, success?: string) {
    setMessage(null);
    startTransition(async () => {
      const result = (await action()) as { ok: boolean; error?: string };
      if (!result.ok) setMessage({ tone: "error", text: result.error ?? "Gagal." });
      else if (success) setMessage({ tone: "success", text: success });
      router.refresh();
    });
  }

  function create() {
    setMessage(null);
    setSecret(null);
    startTransition(async () => {
      const target = draft.kind === "telegram" ? `${draft.target.trim()}|${draft.chat.trim()}` : draft.target;
      const result = await createWebhook({ name: draft.name, kind: draft.kind, target, secret: draft.secret || undefined, events: draft.events });
      if (!result.ok) return setMessage({ tone: "error", text: result.error });
      if (result.value.secret) setSecret(result.value.secret);
      setAdding(false);
      setDraft({ ...draft, name: "", target: "", chat: "", secret: "" });
      setMessage({ tone: "success", text: "Webhook ditambahkan. Coba “Kirim uji” untuk memastikan tersambung." });
      router.refresh();
    });
  }

  async function remove(hook: WebhookView) {
    const ok = await confirmDialog({ title: `Hapus webhook “${hook.name}”?`, message: "Riwayat pengirimannya ikut terhapus.", confirmLabel: "Hapus", tone: "danger" });
    if (ok) run(() => deleteWebhook(hook.id), "Webhook dihapus.");
  }

  function test(hook: WebhookView) {
    setMessage(null);
    startTransition(async () => {
      const result = await testWebhook(hook.id);
      setMessage(result.ok ? { tone: "success", text: `Uji terkirim ke “${hook.name}” (HTTP ${result.value.status}).` } : { tone: "error", text: `Uji ke “${hook.name}” gagal: ${result.error}` });
      router.refresh();
    });
  }

  return (
    <Panel className="max-w-3xl divide-y divide-line">
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <Webhook className="size-4 text-accent" />
              Webhook
            </h2>
            <p className="mt-1 text-xs text-fg-subtle">Kirim kabar ke Slack, Discord, Telegram, atau sistem Anda sendiri saat halaman terbit, ada komentar baru, dan lainnya.</p>
          </div>
          {!adding && (
            <Button size="sm" variant="secondary" onClick={() => setAdding(true)} disabled={!canEncrypt}>
              <Plus className="size-3.5" />
              Tambah webhook
            </Button>
          )}
        </div>
        {!canEncrypt && <Alert>ENCRYPTION_KEY belum diatur di server, jadi URL dan token webhook tidak bisa disimpan dengan aman.</Alert>}
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        {secret && (
          <div className="space-y-2 rounded-lg border border-line bg-fill/40 p-3 text-sm">
            <p className="font-medium text-fg">Rahasia penandatangan (hanya ditampilkan sekali)</p>
            <p className="text-xs text-fg-muted">Verifikasi header X-Docsku-Signature: sha256=HMAC-SHA256(rahasia, isi permintaan mentah).</p>
            <div className="flex gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-surface px-2 py-1.5 font-mono text-xs select-all">{secret}</code>
              <Button size="sm" variant="secondary" onClick={() => navigator.clipboard?.writeText(secret)}>
                <Copy className="size-3.5" />
                Salin
              </Button>
            </div>
          </div>
        )}

        {adding && (
          <div className="space-y-4 rounded-lg border border-line p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nama">
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Kanal #dokumentasi" />
              </Field>
              <Field label="Jenis">
                <Select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as WebhookKind })}>
                  {WEBHOOK_KINDS.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            {draft.kind === "telegram" ? (
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
                <Field label="Token bot" hint={kindInfo.hint}>
                  <Input value={draft.target} onChange={(e) => setDraft({ ...draft, target: e.target.value })} placeholder="123456789:AA…" autoComplete="off" spellCheck={false} />
                </Field>
                <Field label="Chat id">
                  <Input value={draft.chat} onChange={(e) => setDraft({ ...draft, chat: e.target.value })} placeholder="-1001234567890" autoComplete="off" spellCheck={false} />
                </Field>
              </div>
            ) : (
              <Field label="URL webhook" hint={kindInfo.hint}>
                <Input value={draft.target} onChange={(e) => setDraft({ ...draft, target: e.target.value })} placeholder="https://…" autoComplete="off" spellCheck={false} />
              </Field>
            )}
            {draft.kind === "custom" && (
              <Field label="Rahasia penandatangan (opsional)" hint="Kosongkan agar dibuatkan; ditampilkan sekali setelah disimpan.">
                <Input value={draft.secret} onChange={(e) => setDraft({ ...draft, secret: e.target.value })} autoComplete="off" spellCheck={false} />
              </Field>
            )}
            <EventChecks value={draft.events} onChange={(events) => setDraft({ ...draft, events })} />
            <div className="flex gap-2">
              <Button size="sm" onClick={create} disabled={pending}>
                Simpan webhook
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
                Batal
              </Button>
            </div>
          </div>
        )}

        {hooks.length === 0 && !adding && <p className="text-sm text-fg-muted">Belum ada webhook.</p>}
        <ul className="space-y-3">
          {hooks.map((hook) => (
            <HookItem key={hook.id} hook={hook} pending={pending} onTest={() => test(hook)} onRemove={() => remove(hook)} run={run} />
          ))}
        </ul>
      </div>

      {deliveries.length > 0 && (
        <div className="p-5">
          <h3 className="mb-3 text-sm font-medium text-fg">Pengiriman terakhir</h3>
          <ul className="divide-y divide-line text-sm">
            {deliveries.map((d) => {
              const status = STATUS[d.status] ?? STATUS.pending;
              return (
                <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}>{status.label}</span>
                  <span className="min-w-0 flex-1 truncate text-fg">
                    {d.event === "test" ? "Uji" : (EVENT_LABEL[d.event] ?? d.event)} <span className="text-fg-subtle">→ {d.webhookName}</span>
                  </span>
                  <span className="text-xs text-fg-subtle tabular-nums">
                    {d.responseStatus ? `HTTP ${d.responseStatus} · ` : ""}
                    {time(d.createdAt)}
                  </span>
                  {d.status !== "pending" && d.status !== "sending" && (
                    <Button size="sm" variant="ghost" onClick={() => run(() => redeliver(d.id), "Dikirim ulang.")} disabled={pending} title="Kirim ulang">
                      <RotateCw className="size-3.5" />
                      Kirim ulang
                    </Button>
                  )}
                  {d.lastError && d.status !== "delivered" && <p className="basis-full truncate text-xs text-red-600 dark:text-red-400" title={d.lastError}>{d.lastError}</p>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Panel>
  );
}

function HookItem({
  hook,
  pending,
  onTest,
  onRemove,
  run,
}: {
  hook: WebhookView;
  pending: boolean;
  onTest: () => void;
  onRemove: () => void;
  run: (action: () => Promise<{ ok: boolean; error?: string }>, success?: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [events, setEvents] = useState(hook.events as WebhookEventKey[]);
  return (
    <li className="rounded-lg border border-line p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="rounded-md bg-fill px-2 py-0.5 text-xs font-medium text-fg-muted">{KIND_LABEL[hook.kind]}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-fg">{hook.name}</span>
          <span className="block truncate font-mono text-xs text-fg-subtle">{hook.target}</span>
        </span>
        <label className="flex items-center gap-1.5 text-xs text-fg-muted">
          <input type="checkbox" className="accent-accent" checked={hook.enabled} disabled={pending} onChange={(e) => run(() => updateWebhook(hook.id, { enabled: e.target.checked }))} />
          Aktif
        </label>
      </div>
      {editing ? (
        <div className="mt-3 space-y-3">
          <EventChecks value={events} onChange={setEvents} />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                run(() => updateWebhook(hook.id, { events }), "Kejadian disimpan.");
                setEditing(false);
              }}
              disabled={pending}
            >
              Simpan
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Batal
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {hook.events.map((e) => (
            <span key={e} className="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent">
              {EVENT_LABEL[e] ?? e}
            </span>
          ))}
          <span className="ml-auto flex flex-wrap gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              Ubah kejadian
            </Button>
            <Button size="sm" variant="secondary" onClick={onTest} disabled={pending}>
              <Send className="size-3.5" />
              Kirim uji
            </Button>
            <Button size="sm" variant="danger" onClick={onRemove} disabled={pending} aria-label={`Hapus ${hook.name}`}>
              <Trash2 className="size-3.5" />
            </Button>
          </span>
        </div>
      )}
    </li>
  );
}
