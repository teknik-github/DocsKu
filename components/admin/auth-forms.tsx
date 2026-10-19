"use client";

import { useActionState } from "react";
import { loginAction, setupAction } from "@/app/admin/(auth)/actions";
import { Alert, Button, Field, Input } from "@/components/admin/ui";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Alert>{state.error}</Alert>}
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Email" error={state?.fieldErrors?.email}>
        <Input name="email" type="email" autoComplete="email" required autoFocus defaultValue={state?.values?.email} />
      </Field>
      <Field label="Password" error={state?.fieldErrors?.password}>
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Button type="submit" variant="primary" className="w-full" disabled={pending}>
        {pending ? "Masuk…" : "Masuk"}
      </Button>
    </form>
  );
}

export function SetupForm() {
  const [state, action, pending] = useActionState(setupAction, undefined);
  const errors = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Alert>{state.error}</Alert>}
      <Field label="Nama" error={errors.name}>
        <Input name="name" autoComplete="name" required autoFocus defaultValue={state?.values?.name} />
      </Field>
      <Field label="Email" error={errors.email}>
        <Input name="email" type="email" autoComplete="email" required defaultValue={state?.values?.email} />
      </Field>
      <Field label="Password" hint="Minimal 10 karakter." error={errors.password}>
        <Input name="password" type="password" autoComplete="new-password" required minLength={10} />
      </Field>
      <Field label="Ulangi password" error={errors.confirm}>
        <Input name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <Button type="submit" variant="accent" className="w-full" disabled={pending}>
        {pending ? "Membuat akun…" : "Buat akun admin"}
      </Button>
    </form>
  );
}
