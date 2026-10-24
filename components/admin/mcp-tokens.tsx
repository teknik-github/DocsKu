"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, KeyRound, Trash2 } from "lucide-react";
import { createApiToken, revokeApiToken } from "@/app/admin/_actions/mcp";
import { formatDateTime } from "@/components/admin/format";
import { Alert, Button, Field, Input, Panel, Select } from "@/components/admin/ui";
import { copyText } from "@/lib/copy-text";
import { MCP_SCOPES, type McpScope } from "@/lib/mcp/scopes";

export type TokenRow = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  expiresAt: string | null;
  expired: boolean;
  lastUsedAt: string | null;
  createdAt: string;
};

const EXPIRY = [
  { days: 30, label: "30 hari" },
  { days: 90, label: "90 hari" },
  { days: 365, label: "1 tahun" },
  { days: 0, label: "Tidak kedaluwarsa" },
];

const scopeLabel = (id: string) => MCP_SCOPES.find((scope) => scope.id === id)?.label ?? id;

function CopyButton({ text, label = "Salin" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        if (!(await copyText(text))) return;
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-line bg-surface px-2 text-xs text-fg-muted hover:bg-fill hover:text-fg"
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Tersalin" : label}
    </button>
  );
}

function Snippet({ title, code }: { title: string; code: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-fg-muted">{title}</span>
        <CopyButton text={code} />
      </div>
      <pre className="overflow-x-auto rounded-lg border border-line bg-page p-3 font-mono text-[11px] leading-relaxed text-fg">{code}</pre>
    </div>
  );
}

/** How to add Docsku to common MCP clients. */
function ConnectGuide({ endpoint, token }: { endpoint: string; token: string }) {
  const auth = `Bearer ${token}`;
  return (
    <div className="space-y-3">
      <Snippet title="Claude Code" code={`claude mcp add --transport http docsku ${endpoint} \\\n  --header "Authorization: ${auth}"`} />
      <Snippet
        title="Cursor, VS Code, dan klien lain dengan HTTP (mcp.json)"
        code={JSON.stringify({ mcpServers: { docsku: { url: endpoint, headers: { Authorization: auth } } } }, null, 2)}
      />
      <Snippet
        title="Claude Desktop (claude_desktop_config.json, lewat mcp-remote)"
        code={JSON.stringify(
          { mcpServers: { docsku: { command: "npx", args: ["-y", "mcp-remote", endpoint, "--header", `Authorization:${auth}`] } } },
          null,
          2,
        )}
      />
    </div>
  );
}

/** Personal API tokens for the /api/mcp endpoint, plus setup snippets. */
export function McpTokens({ endpoint, tokens }: { endpoint: string; tokens: TokenRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<McpScope[]>(["read"]);
  const [days, setDays] = useState(90);
  const [created, setCreated] = useState<{ name: string; token: string } | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function create() {
    setError("");
    startTransition(async () => {
      const result = await createApiToken({ name, scopes, days: days || null });
      if (!result.ok) return setError(result.error);
      setCreated({ name, token: result.token });
      setName("");
      router.refresh();
    });
  }

  function revoke(token: TokenRow) {
    if (!confirm(`Cabut token "${token.name}"? Aplikasi yang memakainya langsung kehilangan akses.`)) return;
    startTransition(async () => {
      const result = await revokeApiToken(token.id);
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  return (
    <Panel className="max-w-3xl space-y-6 p-5">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <KeyRound className="size-4 text-accent" />
          Akses MCP ke Docsku
        </h2>
        <p className="mt-1 text-xs text-fg-subtle">
          Alamat server MCP: <code className="text-fg">{endpoint}</code>. Setiap token bertindak atas nama Anda dengan izin yang Anda pilih,
          dan tidak pernah lebih dari hak akun Anda.
        </p>
      </div>

      {created && (
        <div className="space-y-4 rounded-xl border border-emerald-300/70 bg-emerald-50/60 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/20">
          <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
            Token &ldquo;{created.name}&rdquo; dibuat. Salin sekarang: token tidak bisa ditampilkan lagi.
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md border border-line bg-surface px-2 py-1.5 font-mono text-xs text-fg" data-testid="new-token">
              {created.token}
            </code>
            <CopyButton text={created.token} label="Salin token" />
          </div>
          <ConnectGuide endpoint={endpoint} token={created.token} />
          <Button size="sm" variant="secondary" onClick={() => setCreated(null)}>
            Selesai
          </Button>
        </div>
      )}

      <div className="space-y-4 rounded-xl border border-line p-4">
        <h3 className="text-sm font-medium">Buat token baru</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nama">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Claude Desktop di laptop" maxLength={60} />
          </Field>
          <Field label="Masa berlaku">
            <Select value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {EXPIRY.map((option) => (
                <option key={option.days} value={option.days}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <fieldset className="space-y-2">
          <legend className="mb-1.5 text-sm font-medium">Izin</legend>
          {MCP_SCOPES.map((scope) => (
            <label key={scope.id} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={scopes.includes(scope.id)}
                onChange={(e) => setScopes(e.target.checked ? [...scopes, scope.id] : scopes.filter((s) => s !== scope.id))}
                className="mt-0.5 accent-accent"
              />
              <span>
                {scope.label}
                <span className="block text-xs text-fg-subtle">{scope.description}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {error && <Alert>{error}</Alert>}
        <Button variant="accent" onClick={create} disabled={pending}>
          {pending ? "Membuat…" : "Buat token"}
        </Button>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium">Token Anda</h3>
        {tokens.length === 0 ? (
          <p className="text-sm text-fg-subtle">Belum ada token.</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {tokens.map((token) => {
              const { expired } = token;
              return (
                <li key={token.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5 text-sm">
                      {token.name}
                      <code className="text-xs text-fg-subtle">{token.prefix}…</code>
                      {token.scopes.map((scope) => (
                        <span key={scope} className="rounded bg-fill px-1.5 py-0.5 text-[10px] font-medium text-fg-muted">
                          {scopeLabel(scope)}
                        </span>
                      ))}
                      {expired && <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">Kedaluwarsa</span>}
                    </span>
                    <span className="block text-xs text-fg-subtle">
                      Dibuat {formatDateTime(token.createdAt)} · {token.lastUsedAt ? `terakhir dipakai ${formatDateTime(token.lastUsedAt)}` : "belum pernah dipakai"}
                      {token.expiresAt && !expired && ` · berlaku sampai ${formatDateTime(token.expiresAt)}`}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => revoke(token)}
                    disabled={pending}
                    className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                  >
                    <Trash2 className="size-3.5" />
                    Cabut
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {!created && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-fg-muted hover:text-fg">Cara menghubungkan klien MCP</summary>
          <div className="mt-3">
            <ConnectGuide endpoint={endpoint} token="<TOKEN>" />
          </div>
        </details>
      )}
    </Panel>
  );
}
