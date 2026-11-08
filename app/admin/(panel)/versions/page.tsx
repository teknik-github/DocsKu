import { Suspense } from "react";
import { requirePermission } from "@/lib/auth/dal";
import { getVersionSettings, getVersions } from "@/lib/versions";
import { PageHeader } from "@/components/admin/ui";
import { VersionsManager } from "@/components/admin/versions-manager";

export const metadata = { title: "Versi dokumentasi" };

export default function VersionsPage() {
  return (
    <>
      <PageHeader
        title="Versi dokumentasi"
        description="Simpan dokumentasi saat ini sebagai versi arsip sebelum mengubahnya untuk rilis baru. Pembaca bisa berpindah versi lewat pemilih di header; versi lama hanya bisa dibaca."
      />
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-fill" />}>
        <Versions />
      </Suspense>
    </>
  );
}

async function Versions() {
  await requirePermission("site.admin");
  const [versions, settings] = await Promise.all([getVersions(), getVersionSettings()]);
  return <VersionsManager versions={versions} currentLabel={settings.currentLabel} />;
}
