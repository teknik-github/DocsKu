import { Suspense } from "react";
import { redirect } from "next/navigation";
import { count } from "drizzle-orm";
import { db, schema } from "@/db";
import { AuthCard } from "@/components/admin/auth-card";
import { SetupForm } from "@/components/admin/auth-forms";

export const metadata = { title: "Setup" };

export default function SetupPage() {
  return (
    <AuthCard title="Selamat datang" description="Buat akun admin pertama untuk mengelola dokumentasi.">
      <Suspense fallback={<div className="h-80" />}>
        <SetupGate />
      </Suspense>
    </AuthCard>
  );
}

/** Setup only runs once: as soon as any user exists, send people to login. */
async function SetupGate() {
  const [{ total }] = await db.select({ total: count() }).from(schema.users);
  if (total > 0) redirect("/admin/login");
  return <SetupForm />;
}
