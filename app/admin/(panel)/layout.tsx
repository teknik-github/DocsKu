import { Suspense } from "react";
import { requireUser } from "@/lib/auth/dal";
import { AdminShell, AdminShellSkeleton } from "@/components/admin/shell";

// The dashboard reads the session cookie, so it renders per request behind
// Suspense. Each page and action still checks auth on its own.
export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<AdminShellSkeleton />}>
      <AuthedShell>{children}</AuthedShell>
    </Suspense>
  );
}

async function AuthedShell({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <AdminShell user={user}>
      {children}
    </AdminShell>
  );
}
