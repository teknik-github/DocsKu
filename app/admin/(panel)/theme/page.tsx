import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/dal";
import { readSettingForAdmin } from "@/lib/data/admin";
import type { SiteSettings } from "@/lib/site-types";
import { ThemePicker } from "@/components/admin/theme-picker";
import { PageHeader } from "@/components/admin/ui";

export const metadata = { title: "Tema" };

export default function ThemePage() {
  return (
    <>
      <PageHeader title="Tema" description="Pilih cara dokumentasi (/docs) ditampilkan ke pengunjung. Bisa diganti kapan saja." />
      <Suspense fallback={<div className="h-80 animate-pulse rounded-xl bg-fill" />}>
        <Theme />
      </Suspense>
    </>
  );
}

async function Theme() {
  await requireAdmin();
  const site = await readSettingForAdmin<Partial<SiteSettings>>("site");
  return <ThemePicker current={site?.layout ?? "docs"} />;
}
