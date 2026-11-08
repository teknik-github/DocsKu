import { Suspense } from "react";
import { redirect } from "next/navigation";
import { count } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth/dal";
import { AuthCard } from "@/components/admin/auth-card";
import { LoginForm } from "@/components/admin/auth-forms";

export const metadata = { title: "Masuk" };

export default function LoginPage({ searchParams }: PageProps<"/admin/login">) {
  return (
    <AuthCard
      title="Masuk ke akun Anda"
      description="Masukkan email dan password untuk membuka dashboard dokumentasi."
      footer="Lupa password atau belum punya akun? Minta admin tim Anda untuk mengatur ulang atau menambahkan akun."
    >
      <Suspense fallback={<div className="h-56" />}>
        <LoginGate searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  );
}

async function LoginGate({ searchParams }: Pick<PageProps<"/admin/login">, "searchParams">) {
  if (await getCurrentUser()) redirect("/admin");
  const [{ total }] = await db.select({ total: count() }).from(schema.users);
  if (total === 0) redirect("/admin/setup");
  const { next, habis } = await searchParams;
  return (
    <LoginForm
      next={typeof next === "string" ? next : undefined}
      notice={habis ? "Verifikasi dua langkah berakhir (waktu habis atau terlalu banyak kode salah). Masukkan email dan password lagi." : undefined}
    />
  );
}
