"use client";

import { useState, useTransition } from "react";
import { Pencil, RefreshCw, Server, Trash2 } from "lucide-react";
import { deleteMcpServer, saveMcpServer, setMcpEnabled, type McpServerForm } from "@/app/admin/_actions/mcp";
import type { McpServerView } from "@/lib/mcp/external";
import { formatDateTime } from "@/components/admin/format";
import { Alert, Button, Field, Input, Panel } from "@/components/admin/ui";

const EMPTY: McpServerForm = { name: "", url: "", headerName: "Authorization", headerValue: "" };

/** External MCP servers whose tools the AI Chat agent may use (admins only). */
export function McpServers({ initial }: { initial: McpServerView[] }) {
  const [servers, setServers] = useState(initial);
  const [form, setForm] = useState<McpServerForm | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const editing = form?.id ? servers.find((s) => s.id === form.id) : undefined;

  function save(input: McpServerForm) {
    setMessage(null);
    startTransition(async () => {
      const result = await saveMcpServer(input);
      if (!result.ok) return setMessage({ tone: "error", text: result.error });
      const server = result.server;
      setServers((list) => (list.some((s) => s.id === server.id) ? list.map((s) => (s.id === server.id ? server : s)) : [...list, server]));
      setForm(null);
      setMessage({ tone: "success", text: `Terhubung ke ${server.name}: ${server.tools.length} tool ditemukan.` });
    });
  }

  function toggle(id: string, enabled: boolean, tool?: string) {
    setServers((list) =>
      list.map((s) =>
        s.id !== id ? s : tool ? { ...s, tools: s.tools.map((t) => (t.name === tool ? { ...t, enabled } : t)) } : { ...s, enabled },
      ),
    );
    startTransition(async () => {
      const result = await setMcpEnabled({ id, enabled, tool });
      if (!result.ok) setMessage({ tone: "error", text: result.error });
    });
  }

  function remove(server: McpServerView) {
    if (!confirm(`Hapus server MCP "${server.name}"? AI Chat tidak bisa lagi memakai tool-nya.`)) return;
    startTransition(async () => {
      const result = await deleteMcpServer(server.id);
      if (!result.ok) return setMessage({ tone: "error", text: result.error });
      setServers((list) => list.filter((s) => s.id !== server.id));
    });
  }

  return (
    <Panel className="max-w-3xl space-y-6 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <Server className="size-4 text-accent" />
            Server MCP untuk AI Chat
          </h2>
          <p className="mt-1 text-xs text-fg-subtle">
            Agen AI Chat bisa memakai tool dari server MCP jarak jauh (Streamable HTTP) yang Anda daftarkan. Pilih tool yang boleh dipakai;
            tool baru hanya aktif otomatis bila server menandainya baca saja.
          </p>
        </div>
        {!form && (
          <Button size="sm" variant="secondary" onClick={() => setForm(EMPTY)}>
            Tambah server
          </Button>
        )}
      </div>

      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      {form && (
        <div className="space-y-4 rounded-xl border border-line p-4">
          <h3 className="text-sm font-medium">{form.id ? `Ubah ${editing?.name ?? "server"}` : "Server baru"}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nama">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="mis. GitHub" maxLength={40} />
            </Field>
            <Field label="Alamat (URL)">
              <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://contoh.com/mcp" />
            </Field>
            <Field label="Nama header" hint="Untuk login ke server, mis. Authorization. Opsional.">
              <Input value={form.headerName} onChange={(e) => setForm({ ...form, headerName: e.target.value })} />
            </Field>
            <Field
              label="Nilai header"
              hint={editing?.headerNames.length ? `Tersimpan: ${editing.headerNames.join(", ")}. Kosongkan untuk mempertahankan (hanya jika domain alamatnya tidak berubah).` : "Disimpan terenkripsi, tidak pernah ditampilkan lagi."}
            >
              <Input
                type="password"
                value={form.headerValue}
                onChange={(e) => setForm({ ...form, headerValue: e.target.value })}
                placeholder="Bearer …"
                autoComplete="off"
              />
            </Field>
          </div>
          {editing && editing.headerNames.length > 0 && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={Boolean(form.clearHeaders)} onChange={(e) => setForm({ ...form, clearHeaders: e.target.checked })} className="accent-accent" />
              Hapus header yang tersimpan
            </label>
          )}
          <div className="flex gap-2">
            <Button variant="accent" onClick={() => save(form)} disabled={pending}>
              {pending ? "Menghubungkan…" : "Simpan & ambil tool"}
            </Button>
            <Button variant="ghost" onClick={() => setForm(null)} disabled={pending}>
              Batal
            </Button>
          </div>
        </div>
      )}

      {servers.length === 0 && !form && <p className="text-sm text-fg-subtle">Belum ada server MCP.</p>}

      {servers.map((server) => (
        <div key={server.id} className="rounded-xl border border-line">
          <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={server.enabled} onChange={(e) => toggle(server.id, e.target.checked)} className="accent-accent" />
              {server.name}
            </label>
            <code className="min-w-0 flex-1 truncate text-xs text-fg-subtle">{server.url}</code>
            <span className="flex gap-1">
              <button
                type="button"
                title="Ambil ulang daftar tool"
                aria-label={`Perbarui tool ${server.name}`}
                disabled={pending}
                onClick={() => save({ id: server.id, name: server.name, url: server.url, headerName: "", headerValue: "" })}
                className="inline-flex size-7 items-center justify-center rounded-md text-fg-muted hover:bg-fill hover:text-fg"
              >
                <RefreshCw className="size-3.5" />
              </button>
              <button
                type="button"
                title="Ubah"
                aria-label={`Ubah ${server.name}`}
                onClick={() => setForm({ id: server.id, name: server.name, url: server.url, headerName: server.headerNames[0] ?? "Authorization", headerValue: "" })}
                className="inline-flex size-7 items-center justify-center rounded-md text-fg-muted hover:bg-fill hover:text-fg"
              >
                <Pencil className="size-3.5" />
              </button>
              <button
                type="button"
                title="Hapus"
                aria-label={`Hapus ${server.name}`}
                onClick={() => remove(server)}
                className="inline-flex size-7 items-center justify-center rounded-md text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
              >
                <Trash2 className="size-3.5" />
              </button>
            </span>
          </div>
          <div className="px-4 py-3">
            <p className="mb-2 text-xs text-fg-subtle">
              {server.tools.filter((t) => t.enabled).length} dari {server.tools.length} tool aktif
              {server.checkedAt && ` · diperbarui ${formatDateTime(server.checkedAt)}`}
              {server.headerNames.length > 0 && ` · header: ${server.headerNames.join(", ")}`}
            </p>
            <ul className={`space-y-2 ${server.enabled ? "" : "opacity-50"}`}>
              {server.tools.map((tool) => (
                <li key={tool.name}>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={tool.enabled}
                      onChange={(e) => toggle(server.id, e.target.checked, tool.name)}
                      className="mt-0.5 accent-accent"
                    />
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <code className="text-xs">{tool.name}</code>
                        {tool.readOnly ? (
                          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">Baca saja</span>
                        ) : (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">Bisa mengubah</span>
                        )}
                      </span>
                      {tool.description && <span className="line-clamp-2 block text-xs text-fg-subtle">{tool.description}</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ))}
    </Panel>
  );
}
