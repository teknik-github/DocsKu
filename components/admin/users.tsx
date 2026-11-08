"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, KeyRound, PenLine, Search, ShieldCheck, ShieldOff, Shuffle, Trash2, UserPlus, X } from "lucide-react";
import { changeRole, createUser, deleteUser, resetPassword } from "@/app/admin/_actions/users";
import { resetUserTwoFactor } from "@/app/admin/_actions/two-factor";
import { formatDateTime } from "@/components/admin/format";
import { Alert, Button, Field, Input, Panel, Select, inputClass } from "@/components/admin/ui";
import { confirmDialog, promptDialog } from "@/components/admin/dialog";
import { copyText } from "@/lib/copy-text";
import { Avatar } from "@/components/avatar";

export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "editor";
  createdAt: string;
  /** Docs pages this user created. */
  pages: number;
  lastLogin: string | null;
  /** Has a session that hasn't expired (signed in somewhere). */
  active: boolean;
  /** Two-step login (TOTP) is on. */
  twoFactor: boolean;
  avatar: string | null;
  jobTitle: string | null;
};

const ROLES = {
  admin: {
    label: "Admin",
    icon: ShieldCheck,
    text: "Semua yang bisa dilakukan editor, plus navigasi, tema, redirect, pengguna, dan pengaturan (termasuk AI).",
  },
  editor: {
    label: "Editor",
    icon: PenLine,
    text: "Menulis, menyunting, menerbitkan, dan menjadwalkan halaman; mengunggah media; memakai AI; mengelola komentar.",
  },
} as const;

/** /admin/users: summary, what each role may do, and the list with inline actions. */
export function UsersView({ users, currentUserId }: { users: UserRow[]; currentUserId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    startTransition(async () => {
      const result = await fn();
      setMessage(result.ok ? { tone: "success", text: success } : { tone: "error", text: result.error ?? "Gagal." });
      router.refresh();
    });

  const term = query.trim().toLowerCase();
  const shown = term ? users.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(term)) : users;
  const admins = users.filter((u) => u.role === "admin").length;
  const stats = [
    { label: "Pengguna", value: users.length },
    { label: "Admin", value: admins },
    { label: "Editor", value: users.length - admins },
    { label: "Sedang masuk", value: users.filter((u) => u.active).length },
    { label: "Pakai 2FA", value: users.filter((u) => u.twoFactor).length },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
          {stats.map((stat) => (
            <div key={stat.label} className="min-w-24 rounded-xl border border-line bg-surface px-4 py-2.5">
              <div className="text-xl font-semibold text-fg tabular-nums">{stat.value}</div>
              <div className="text-xs text-fg-subtle">{stat.label}</div>
            </div>
          ))}
        </div>
        <Button variant="accent" onClick={() => setAdding(true)}>
          <UserPlus className="size-4" />
          Tambah pengguna
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {(Object.keys(ROLES) as (keyof typeof ROLES)[]).map((key) => {
          const role = ROLES[key];
          return (
            <div key={key} className="flex gap-3 rounded-xl border border-line bg-surface p-4">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                <role.icon className="size-4" />
              </span>
              <div>
                <p className="text-sm font-medium text-fg">{role.label}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{role.text}</p>
              </div>
            </div>
          );
        })}
      </div>

      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <Panel className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 className="text-sm font-medium text-fg">Semua pengguna</h2>
          {users.length > 4 && (
            <label className="relative w-full sm:w-60">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari nama atau email…" aria-label="Cari pengguna" className={`${inputClass} h-8 pl-9`} />
            </label>
          )}
        </div>

        {/* Column headings on wide screens; each row becomes a card on small ones. */}
        <div className="hidden grid-cols-[minmax(0,1fr)_8rem_5rem_12rem_6.5rem] gap-4 border-b border-line px-5 py-2 text-xs text-fg-subtle md:grid">
          <span>Pengguna</span>
          <span>Peran</span>
          <span className="text-right">Halaman</span>
          <span>Terakhir masuk</span>
          <span className="sr-only">Aksi</span>
        </div>

        <ul className="divide-y divide-line">
          {shown.length === 0 && <li className="px-5 py-10 text-center text-sm text-fg-subtle">Tidak ada pengguna yang cocok.</li>}
          {shown.map((user) => {
            const self = user.id === currentUserId;
            const lastAdmin = user.role === "admin" && admins <= 1;
            return (
              <li key={user.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_8rem_5rem_12rem_6.5rem]">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={user.name} src={user.avatar} size={36} />
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-fg">
                      <span className="truncate">{user.name}</span>
                      {self && <span className="shrink-0 rounded-full bg-accent-soft px-1.5 py-px text-[10px] font-medium text-accent">Anda</span>}
                      {user.twoFactor && (
                        <span
                          className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-px text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                          title="Verifikasi dua langkah aktif"
                        >
                          <ShieldCheck className="size-2.5" />
                          2FA
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-fg-subtle">
                      {user.jobTitle && <span className="text-fg-muted">{user.jobTitle} · </span>}
                      {user.email}
                    </p>
                  </div>
                </div>

                {/* Actions: right of the name on small screens, last column on wide ones. */}
                <div className="flex justify-end gap-0.5 md:order-last">
                  {user.twoFactor && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      title="Atur ulang verifikasi dua langkah"
                      aria-label={`Atur ulang 2FA ${user.name}`}
                      onClick={async () => {
                        const ok = await confirmDialog({
                          title: `Atur ulang 2FA ${user.name}?`,
                          message: `${user.email} bisa masuk hanya dengan password sampai mengaktifkan verifikasi dua langkah lagi. Lakukan ini hanya jika ponsel dan kode pemulihannya hilang, dan pastikan permintaan ini benar-benar dari orangnya.`,
                          confirmLabel: "Atur ulang 2FA",
                          tone: "danger",
                        });
                        if (ok) act(() => resetUserTwoFactor(user.id), `Verifikasi dua langkah ${user.name} dinonaktifkan.`);
                      }}
                    >
                      <ShieldOff className="size-3.5" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    title="Atur ulang password"
                    aria-label={`Atur ulang password ${user.name}`}
                    onClick={async () => {
                      const password = await promptDialog({
                        title: `Atur ulang password ${user.name}`,
                        message: `${user.email} akan dikeluarkan dari semua perangkat dan masuk dengan password baru ini.`,
                        label: "Password baru",
                        type: "password",
                        minLength: 10,
                        placeholder: "Minimal 10 karakter",
                        confirmLabel: "Atur ulang",
                      });
                      if (password) act(() => resetPassword(user.id, password), "Password diatur ulang. Pengguna telah dikeluarkan dari semua perangkat.");
                    }}
                  >
                    <KeyRound className="size-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={self || pending || lastAdmin}
                    title={self ? "Akun sendiri tidak bisa dihapus" : lastAdmin ? "Harus ada minimal satu admin" : "Hapus pengguna"}
                    aria-label={`Hapus ${user.name}`}
                    className="hover:text-red-600"
                    onClick={async () => {
                      const ok = await confirmDialog({
                        title: `Hapus akun ${user.name}?`,
                        message: `${user.email} tidak bisa masuk lagi. ${user.pages ? `${user.pages} halaman yang ditulisnya tetap ada.` : "Halaman yang ditulisnya tetap ada."}`,
                        confirmLabel: "Hapus akun",
                        tone: "danger",
                      });
                      if (ok) act(() => deleteUser(user.id), "Pengguna dihapus.");
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>

                <div className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-2 md:col-span-1">
                  <Select
                    value={user.role}
                    disabled={self || pending || lastAdmin}
                    title={self ? "Peran akun sendiri tidak bisa diubah" : lastAdmin ? "Harus ada minimal satu admin" : undefined}
                    aria-label={`Peran ${user.name}`}
                    onChange={(e) => act(() => changeRole(user.id, e.target.value as UserRow["role"]), `Peran ${user.name} diperbarui.`)}
                    className="h-8 w-28! text-xs"
                  >
                    <option value="admin">Admin</option>
                    <option value="editor">Editor</option>
                  </Select>
                  <span className="text-xs text-fg-muted md:hidden">
                    {user.pages} halaman · {user.lastLogin ? `masuk ${formatDateTime(user.lastLogin)}` : "belum pernah masuk"}
                  </span>
                </div>
                <p className="hidden text-right text-sm text-fg-muted tabular-nums md:block">{user.pages}</p>
                <div className="hidden text-xs md:block">
                  <p className="flex items-center gap-1.5 text-fg-muted">
                    {user.active && <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" title="Punya sesi masuk yang masih berlaku" aria-label="Aktif" />}
                    {user.lastLogin ? formatDateTime(user.lastLogin) : "Belum pernah masuk"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-fg-subtle">Bergabung {formatDateTime(user.createdAt)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>

      {adding && (
        <NewUserDialog
          onClose={() => setAdding(false)}
          onCreated={(text) => {
            setAdding(false);
            setMessage({ tone: "success", text });
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

/** 14 characters without look-alikes (0/O, 1/l/I). getRandomValues works on plain-HTTP pages too. */
function randomPassword() {
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

function NewUserDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (message: string) => void }) {
  const [state, action, pending] = useActionState(createUser, undefined);
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  const errors = state?.fieldErrors ?? {};
  const values = state?.values ?? {};

  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (state?.success && !done.current) {
      done.current = true;
      onCreated(state.success);
    }
  }, [state, onCreated]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]" onMouseDown={onClose}>
      <form
        action={action}
        role="dialog"
        aria-modal="true"
        aria-label="Tambah pengguna"
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-4 rounded-2xl border border-line bg-surface p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-fg">Tambah pengguna</h2>
            <p className="mt-0.5 text-xs text-fg-muted">Berikan email dan password awal kepada orangnya; ia bisa menggantinya di Profil.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup" className="text-fg-subtle hover:text-fg">
            <X className="size-4" />
          </button>
        </div>
        {state?.error && <Alert>{state.error}</Alert>}
        <Field label="Nama" error={errors.name}>
          <Input ref={first} name="name" required defaultValue={values.name} autoComplete="off" />
        </Field>
        <Field label="Email" error={errors.email}>
          <Input name="email" type="email" required defaultValue={values.email} autoComplete="off" />
        </Field>
        <div>
          <span className="mb-1.5 block text-sm font-medium text-fg">Peran</span>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(ROLES) as (keyof typeof ROLES)[]).map((key) => (
              <label key={key} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm has-checked:border-accent has-checked:bg-accent-soft/40">
                <input type="radio" name="role" value={key} defaultChecked={(values.role ?? "editor") === key} className="accent-accent" />
                {ROLES[key].label}
              </label>
            ))}
          </div>
          {errors.role && <span className="mt-1 block text-xs text-red-600 dark:text-red-400">{errors.role}</span>}
        </div>
        <Field label="Password awal" hint="Minimal 10 karakter." error={errors.password}>
          <div className="flex gap-2">
            <Input
              name="password"
              type={visible ? "text" : "password"}
              autoComplete="new-password"
              required
              minLength={10}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="font-mono"
            />
            <Button
              variant="secondary"
              size="sm"
              className="h-9"
              title="Buat password acak"
              onClick={() => {
                setPassword(randomPassword());
                setVisible(true);
                setCopied(false);
              }}
            >
              <Shuffle className="size-3.5" />
              Acak
            </Button>
            {password && (
              <Button variant="ghost" size="sm" className="h-9" title="Salin password" aria-label="Salin password" onClick={async () => setCopied(await copyText(password))}>
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              </Button>
            )}
          </div>
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" variant="accent" size="sm" disabled={pending}>
            {pending ? "Menyimpan…" : "Tambah pengguna"}
          </Button>
        </div>
      </form>
    </div>
  );
}
