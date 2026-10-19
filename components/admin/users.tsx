"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Trash2 } from "lucide-react";
import { changeRole, createUser, deleteUser, resetPassword } from "@/app/admin/_actions/users";
import { formatDateTime } from "@/components/admin/format";
import { Alert, Button, Field, Input, Panel, Select } from "@/components/admin/ui";

type UserRow = { id: string; name: string; email: string; role: "admin" | "editor"; createdAt: string };

export function UsersTable({ users, currentUserId }: { users: UserRow[]; currentUserId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    startTransition(async () => {
      const result = await fn();
      setMessage(result.ok ? { tone: "success", text: success } : { tone: "error", text: result.error ?? "Gagal." });
      router.refresh();
    });

  return (
    <div className="space-y-3">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <Panel className="divide-y divide-line">
        {users.map((user) => {
          const self = user.id === currentUserId;
          return (
            <div key={user.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {user.name}
                  {self && <span className="ml-1.5 text-xs font-normal text-fg-subtle">(Anda)</span>}
                </p>
                <p className="truncate text-xs text-fg-subtle">
                  {user.email} · sejak {formatDateTime(user.createdAt)}
                </p>
              </div>
              <Select
                value={user.role}
                disabled={self || pending}
                aria-label={`Peran ${user.name}`}
                onChange={(e) => act(() => changeRole(user.id, e.target.value as UserRow["role"]), "Peran diperbarui.")}
                className="w-28"
              >
                <option value="admin">Admin</option>
                <option value="editor">Editor</option>
              </Select>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                title="Atur ulang password"
                aria-label={`Atur ulang password ${user.name}`}
                onClick={() => {
                  const password = prompt(`Password baru untuk ${user.email} (minimal 10 karakter):`);
                  if (password) act(() => resetPassword(user.id, password), "Password diatur ulang. Pengguna telah dikeluarkan dari semua perangkat.");
                }}
              >
                <KeyRound className="size-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={self || pending}
                title="Hapus pengguna"
                aria-label={`Hapus ${user.name}`}
                onClick={() =>
                  confirm(`Hapus akun ${user.email}? Halaman yang ditulisnya tetap ada.`) &&
                  act(() => deleteUser(user.id), "Pengguna dihapus.")
                }
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          );
        })}
      </Panel>
    </div>
  );
}

export function NewUserForm() {
  const router = useRouter();
  const [state, action, pending] = useActionState(async (prev: Awaited<ReturnType<typeof createUser>>, formData: FormData) => {
    const result = await createUser(prev, formData);
    if (result?.success) router.refresh();
    return result;
  }, undefined);
  const errors = state?.fieldErrors ?? {};
  // After success the form resets to empty; after an error it keeps what was typed.
  const values = state?.success ? {} : (state?.values ?? {});

  return (
    <form action={action} className="space-y-3">
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.success && <Alert tone="success">{state.success}</Alert>}
      <Field label="Nama" error={errors.name}>
        <Input name="name" required defaultValue={values.name} />
      </Field>
      <Field label="Email" error={errors.email}>
        <Input name="email" type="email" required defaultValue={values.email} />
      </Field>
      <Field label="Peran" error={errors.role}>
        <Select name="role" defaultValue={values.role ?? "editor"}>
          <option value="editor">Editor</option>
          <option value="admin">Admin</option>
        </Select>
      </Field>
      <Field label="Password awal" hint="Minimal 10 karakter. Minta pengguna menggantinya di Profil." error={errors.password}>
        <Input name="password" type="password" autoComplete="new-password" required minLength={10} />
      </Field>
      <Button type="submit" variant="primary" className="w-full" disabled={pending}>
        {pending ? "Menyimpan…" : "Tambah pengguna"}
      </Button>
    </form>
  );
}
