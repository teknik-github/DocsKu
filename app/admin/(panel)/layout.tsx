import { Suspense } from "react";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth/dal";
import { getNavCounts } from "@/lib/data/admin";
import { getSiteSettings } from "@/lib/data/site";
import { AdminShell, AdminShellSkeleton } from "@/components/admin/shell";
import { SIDEBAR_COOKIE } from "@/lib/sidebar-cookie";

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
  const [counts, site, jar] = await Promise.all([getNavCounts(), getSiteSettings(), cookies()]);
  return (
    // The collapsed sidebar is a cookie, so the first render already has the right width.
    <AdminShell user={user} counts={counts} siteName={site.name} collapsed={jar.get(SIDEBAR_COOKIE)?.value === "collapsed"}>
      {children}
    </AdminShell>
  );
}
