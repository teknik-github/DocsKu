import { Suspense } from "react";
import { requireUser } from "@/lib/auth/dal";
import { AdminShell, AdminShellSkeleton } from "@/components/admin/shell";
import { hasUpdate, readUpdates } from "@/lib/updates";

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
  // Uses the last stored check only; the settings page refreshes it.
  const updateAvailable = user.role === "admin" && hasUpdate(await readUpdates());
  return (
    <AdminShell user={user} updateAvailable={updateAvailable}>
      {children}
    </AdminShell>
  );
}
