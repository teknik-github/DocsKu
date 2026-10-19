"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { changeOwnPassword, updateProfile } from "@/app/admin/_actions/users";
import { Alert, Button, Field, Input } from "@/components/admin/ui";

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    async (prev: Awaited<ReturnType<typeof updateProfile>>, formData: FormData) => {
      const result = await updateProfile(prev, formData);
      // The sidebar shows the user's name, so refresh it after a change.
      if (result?.success) router.refresh();
      return result;
    },
    undefined,
  );
  const errors = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-3">
      {state?.success && <Alert tone="success">{state.success}</Alert>}
      <Field label="Nama" error={errors.name}>
        <Input name="name" required defaultValue={state?.values?.name ?? name} />
      </Field>
      <Field label="Email" error={errors.email}>
        <Input name="email" type="email" required defaultValue={state?.values?.email ?? email} />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Menyimpan…" : "Simpan"}
      </Button>
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState(changeOwnPassword, undefined);
  const errors = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-3">
      {state?.success && <Alert tone="success">{state.success}</Alert>}
      <Field label="Password saat ini" error={errors.current}>
        <Input name="current" type="password" autoComplete="current-password" required />
      </Field>
      <Field label="Password baru" hint="Minimal 10 karakter." error={errors.password}>
        <Input name="password" type="password" autoComplete="new-password" required minLength={10} />
      </Field>
      <Field label="Ulangi password baru" error={errors.confirm}>
        <Input name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Menyimpan…" : "Ganti password"}
      </Button>
    </form>
  );
}
