import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { readLoginChallenge } from "@/lib/auth/two-factor";
import { AuthCard } from "@/components/admin/auth-card";
import { VerifyForm } from "@/components/admin/auth-forms";

export const metadata = { title: "Verifikasi dua langkah" };

/** Second step of a login with 2FA (the password step set the challenge cookie). */
export default function VerifyPage({ searchParams }: PageProps<"/admin/login/verify">) {
  return (
    <AuthCard
      title="Verifikasi dua langkah"
      description="Buka aplikasi autentikator di ponsel Anda dan masukkan kode 6 digit untuk akun ini."
      footer="Ponsel hilang dan kode pemulihan tidak ada? Minta admin tim Anda untuk mengatur ulang verifikasi dua langkah."
    >
      <Suspense fallback={<div className="h-48" />}>
        <VerifyGate searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  );
}

async function VerifyGate({ searchParams }: Pick<PageProps<"/admin/login/verify">, "searchParams">) {
  if (await getCurrentUser()) redirect("/admin");
  const challenge = await readLoginChallenge();
  // No (or an ended) challenge: back to the password step, saying why.
  if (!challenge) redirect("/admin/login?habis=1");
  const { next } = await searchParams;
  return <VerifyForm email={challenge.email} next={typeof next === "string" ? next : undefined} />;
}
