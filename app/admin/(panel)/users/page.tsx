import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/dal";
import { listUsers } from "@/lib/data/admin";
import { UsersView } from "@/components/admin/users";
import { PageHeader } from "@/components/admin/ui";

export const metadata = { title: "Pengguna" };

export default function UsersPage() {
  return (
    <>
      <PageHeader title="Pengguna" description="Siapa saja yang bisa masuk ke dasbor, dan apa yang boleh mereka lakukan." />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-fill" />}>
        <Users />
      </Suspense>
    </>
  );
}

async function Users() {
  const me = await requireAdmin();
  return <UsersView currentUserId={me.id} users={await listUsers()} />;
}
