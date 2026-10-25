import { Suspense } from "react";
import { redirect } from "next/navigation";
import { count } from "drizzle-orm";
import { db, schema } from "@/db";
import { AuthCard } from "@/components/admin/auth-card";
import { SetupForm } from "@/components/admin/auth-forms";
import { migrateDatabase } from "@/lib/migrate";

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

/**
 * Setup only runs once: as soon as any user exists, send people to login.
 * The database is migrated first (the server already tried at startup), so a
 * fresh install needs nothing but DATABASE_URL.
 */
async function SetupGate() {
  try {
    await migrateDatabase();
  } catch (error) {
    return (
      <div role="alert" className="space-y-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
        <p className="font-medium">Database belum bisa disiapkan.</p>
        <p>Periksa DATABASE_URL dan pastikan PostgreSQL berjalan, lalu muat ulang halaman ini.</p>
        <p className="font-mono text-xs break-all opacity-80">{error instanceof Error ? error.message : String(error)}</p>
      </div>
    );
  }
  const [{ total }] = await db.select({ total: count() }).from(schema.users);
  if (total > 0) redirect("/admin/login");
  return <SetupForm />;
}
