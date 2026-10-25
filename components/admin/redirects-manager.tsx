"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Trash2 } from "lucide-react";
import { createRedirect, deleteRedirect } from "@/app/admin/_actions/redirects";
import { formatDateTime } from "@/components/admin/format";
import { Alert, Button, Field, Input, Panel } from "@/components/admin/ui";

export type RedirectRow = {
  id: string;
  from: string;
  to: string;
  page: { id: string; title: string } | null;
  auto: boolean;
  hits: number;
  lastHitAt: string | null;
  createdAt: string;
  /** Why it currently doesn't redirect: a published page owns the old path, or its page is off the site. */
  inactive: "shadowed" | "unpublished" | null;
};

const INACTIVE = {
  shadowed: "Tidak aktif: alamat ini dipakai halaman yang terbit",
  unpublished: "Tidak aktif: halaman tujuan belum terbit",
};

export function RedirectsManager({ rows }: { rows: RedirectRow[] }) {
  const router = useRouter();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function add(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await createRedirect({ from, to });
      if (!result.ok) return setMessage({ tone: "error", text: result.error });
      setFrom("");
      setTo("");
      setMessage({ tone: "success", text: "Redirect ditambahkan." });
      router.refresh();
    });
  }

  function remove(row: RedirectRow) {
    if (!confirm(`Hapus redirect dari ${row.from}? Pengunjung alamat itu akan mendapat halaman tidak ditemukan.`)) return;
    startTransition(async () => {
      const result = await deleteRedirect(row.id);
      if (!result.ok) return setMessage({ tone: "error", text: result.error });
      router.refresh();
    });
  }

  return (
    <div className="max-w-4xl space-y-6">
      <Panel className="p-5">
        <form onSubmit={add} className="space-y-4">
          <h2 className="text-sm font-medium">Tambah redirect manual</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Alamat lama" hint="Path di bawah /docs, mis. /docs/panduan-lama">
              <Input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="/docs/panduan-lama" required />
            </Field>
            <Field label="Tujuan" hint="Slug halaman, path situs, atau URL https://">
              <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="/docs/panduan-baru" required />
            </Field>
          </div>
          {message && <Alert tone={message.tone}>{message.text}</Alert>}
          <Button type="submit" size="sm" disabled={pending}>
            Tambah
          </Button>
        </form>
      </Panel>

      <Panel>
        {rows.length === 0 ? (
          <p className="p-5 text-sm text-fg-muted">Belum ada redirect. Redirect otomatis muncul di sini saat slug halaman terbit diubah.</p>
        ) : (
          <ul className="divide-y divide-line" data-testid="redirects">
            {rows.map((row) => (
              <li key={row.id} className="flex items-start gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs">
                    <span className="break-all text-fg">{row.from}</span>
                    <ArrowRight className="size-3.5 shrink-0 text-fg-subtle" />
                    <span className="break-all text-fg-muted">{row.to || "—"}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-subtle">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${row.auto ? "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300" : "bg-fill text-fg-muted"}`}>
                      {row.auto ? "Otomatis" : "Manual"}
                    </span>
                    {row.page && (
                      <Link href={`/admin/pages/${row.page.id}`} className="hover:text-fg">
                        {row.page.title}
                      </Link>
                    )}
                    <span>{row.hits}× dipakai{row.lastHitAt ? `, terakhir ${formatDateTime(row.lastHitAt)}` : ""}</span>
                    <span>dibuat {formatDateTime(row.createdAt)}</span>
                  </div>
                  {row.inactive && <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{INACTIVE[row.inactive]}</p>}
                </div>
                <Button size="sm" variant="ghost" onClick={() => remove(row)} disabled={pending} aria-label={`Hapus redirect ${row.from}`}>
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
