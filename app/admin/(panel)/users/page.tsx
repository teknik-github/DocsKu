import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/dal";
import { listUsers } from "@/lib/data/admin";
import { NewUserForm, UsersTable } from "@/components/admin/users";
import { PageHeader, Panel } from "@/components/admin/ui";

export const metadata = { title: "Pengguna" };

export default function UsersPage() {
  return (
    <>
      <PageHeader
        title="Pengguna"
        description="Admin bisa mengelola semuanya. Editor bisa menulis, menerbitkan, dan mengunggah media."
      />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-fill" />}>
        <Users />
      </Suspense>
    </>
  );
}

async function Users() {
  const me = await requireAdmin();
  const users = await listUsers();
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <UsersTable
        currentUserId={me.id}
        users={users.map((user) => ({ ...user, createdAt: user.createdAt.toISOString() }))}
      />
      <Panel className="h-fit p-5">
        <h2 className="mb-4 text-sm font-medium">Tambah pengguna</h2>
        <NewUserForm />
      </Panel>
    </div>
  );
}
