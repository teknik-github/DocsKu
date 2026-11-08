"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { cancelLoginAction, loginAction, setupAction, verifyLoginAction } from "@/app/admin/(auth)/actions";
import { Alert, Button, Field, Input } from "@/components/admin/ui";

export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="space-y-5">
      {state?.error ? <Alert>{state.error}</Alert> : notice && <Alert>{notice}</Alert>}
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Email" error={state?.fieldErrors?.email}>
        <Input name="email" type="email" autoComplete="email" placeholder="nama@contoh.com" required autoFocus defaultValue={state?.values?.email} />
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

export function VerifyForm({ email, next }: { email: string; next?: string }) {
  const [state, action, pending] = useActionState(verifyLoginAction, undefined);
  const [recovery, setRecovery] = useState(false);
  if (state?.values?.expired) {
    return (
      <div className="space-y-5">
        <Alert>{state.error}</Alert>
        <Link href="/admin/login" className="block text-center text-sm font-medium text-accent hover:underline">
          Kembali ke halaman masuk
        </Link>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <form action={action} className="space-y-5">
        {state?.error && <Alert>{state.error}</Alert>}
        <input type="hidden" name="next" value={next ?? ""} />
        <p className="rounded-lg bg-fill px-3 py-2 text-center text-xs text-fg-muted">
          Masuk sebagai <span className="font-medium text-fg">{email}</span>
        </p>
        {recovery ? (
          <Field label="Kode pemulihan" hint="Salah satu kode yang Anda simpan saat mengaktifkan 2FA. Tiap kode hanya bisa dipakai sekali." error={state?.fieldErrors?.code}>
            <Input key="recovery" name="code" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="xxxx-xxxx" required autoFocus className="font-mono" />
          </Field>
        ) : (
          <Field label="Kode autentikator" error={state?.fieldErrors?.code}>
            <Input
              key="totp"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]{6,7}"
              maxLength={7}
              placeholder="123 456"
              required
              autoFocus
              className="text-center font-mono text-lg tracking-[0.3em]"
            />
          </Field>
        )}
        <Button type="submit" variant="primary" className="w-full" disabled={pending}>
          {pending ? "Memeriksa…" : "Verifikasi"}
        </Button>
      </form>
      <div className="flex items-center justify-between text-sm">
        <button type="button" onClick={() => setRecovery((v) => !v)} className="text-accent hover:underline">
          {recovery ? "Pakai kode autentikator" : "Pakai kode pemulihan"}
        </button>
        <form action={cancelLoginAction}>
          <button type="submit" className="text-fg-muted hover:text-fg">
            Batal
          </button>
        </form>
      </div>
    </div>
  );
}

export function SetupForm() {
  const [state, action, pending] = useActionState(setupAction, undefined);
  const errors = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-5">
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
