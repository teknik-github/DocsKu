import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/dal";
import { listPageOptions, readSettingForAdmin } from "@/lib/data/admin";
import type { NavigationData } from "@/lib/site-types";
import { getLanguageSettings } from "@/lib/data/site";
import { NavigationEditor } from "@/components/admin/navigation-editor";
import { PageHeader } from "@/components/admin/ui";

export const metadata = { title: "Navigasi" };

export default function NavigationPage() {
  return (
    <>
      <PageHeader
        title="Navigasi"
        description="Tab di header dan isi sidebar. Halaman draf dan terjadwal baru muncul setelah terbit."
      />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-fill" />}>
        <Navigation />
      </Suspense>
    </>
  );
}

async function Navigation() {
  await requireAdmin();
  const [navigation, pages, languages] = await Promise.all([
    readSettingForAdmin<NavigationData>("navigation"),
    listPageOptions(),
    getLanguageSettings(),
  ]);
  return <NavigationEditor initial={navigation ?? { tabs: [] }} pages={pages} languages={languages.languages} />;
}
