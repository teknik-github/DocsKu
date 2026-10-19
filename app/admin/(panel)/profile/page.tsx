import { Suspense } from "react";
import { requireUser } from "@/lib/auth/dal";
import { PasswordForm, ProfileForm } from "@/components/admin/profile-forms";
import { PageHeader, Panel } from "@/components/admin/ui";

export const metadata = { title: "Profil" };

export default function ProfilePage() {
  return (
    <>
      <PageHeader title="Profil" description="Nama, email, dan password akun Anda." />
      <Suspense fallback={<div className="h-80 animate-pulse rounded-xl bg-fill" />}>
        <Profile />
      </Suspense>
    </>
  );
}

async function Profile() {
  const user = await requireUser();
  return (
    <div className="grid max-w-3xl gap-6 md:grid-cols-2">
      <Panel className="p-5">
        <h2 className="mb-4 text-sm font-medium">Data akun</h2>
        <ProfileForm name={user.name} email={user.email} />
      </Panel>
      <Panel className="p-5">
        <h2 className="mb-4 text-sm font-medium">Ganti password</h2>
        <PasswordForm />
      </Panel>
    </div>
  );
}
