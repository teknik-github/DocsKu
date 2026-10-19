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
    <AuthCard title="Masuk" description="Masuk ke dashboard dokumentasi.">
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
  const { next } = await searchParams;
  return <LoginForm next={typeof next === "string" ? next : undefined} />;
}
