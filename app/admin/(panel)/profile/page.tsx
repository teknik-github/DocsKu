import { Suspense } from "react";
import { requireUser } from "@/lib/auth/dal";
import { PasswordForm, ProfileForm } from "@/components/admin/profile-forms";
import Link from "next/link";
import { ChevronRight, Plug } from "lucide-react";
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
      <Panel className="md:col-span-2">
        <Link href="/admin/mcp" className="group flex items-center gap-3 p-5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Plug className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-fg group-hover:text-accent">Token MCP pribadi</span>
            <span className="block text-xs text-fg-subtle">Hubungkan Claude, Cursor, atau aplikasi AI lain ke dokumentasi ini dengan akun Anda.</span>
          </span>
          <ChevronRight className="size-4 text-fg-subtle" />
        </Link>
      </Panel>
    </div>
  );
}
