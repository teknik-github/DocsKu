import { Suspense } from "react";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth/dal";
import { getNavCounts } from "@/lib/data/admin";
import { getSiteSettings } from "@/lib/data/site";
import { AdminShell, AdminShellSkeleton } from "@/components/admin/shell";
import { SIDEBAR_COOKIE } from "@/lib/sidebar-cookie";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { getSecuritySettings } from "@/lib/data/security";
import { twoFactorStatus } from "@/lib/auth/two-factor";
import { getAuthor } from "@/lib/data/authors";

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
  const [counts, site, jar, security, profile] = await Promise.all([getNavCounts(user), getSiteSettings(), cookies(), getSecuritySettings(), getAuthor(user.id)]);
  // Pengaturan → Keamanan can require 2FA for admins: remind them on every page until it's on.
  const needs2fa = user.role === "admin" && security.requireAdmin2fa && !(await twoFactorStatus(user.id)).enabled;
  return (
    // The collapsed sidebar is a cookie, so the first render already has the right width.
    <AdminShell user={{ ...user, avatar: profile?.avatar }} counts={counts} siteName={site.name} collapsed={jar.get(SIDEBAR_COOKIE)?.value === "collapsed"}>
      {needs2fa && (
        <Link
          href="/admin/profile#2fa"
          className="mb-6 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <ShieldAlert className="size-4 shrink-0" />
          Admin wajib memakai verifikasi dua langkah. Aktifkan sekarang di Profil →
        </Link>
      )}
      {children}
    </AdminShell>
  );
}
