import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { readSettingForAdmin } from "@/lib/data/admin";
import { HomeSections } from "@/components/home/sections";
import { PreviewBridge } from "@/components/home/preview-bridge";
import { parseHomeSections } from "@/lib/home-schema";
import { defaultSections } from "@/lib/home-sections";

export const metadata: Metadata = { title: "Pratinjau beranda", robots: { index: false, follow: false } };

/**
 * The home builder's working copy, shown in the builder's frame (the only page
 * that may be framed, by this site only: see next.config.ts). Signed-in users only.
 */
export default function HomePreviewPage() {
  return (
    <Suspense fallback={<div className="h-screen animate-pulse bg-fill/40" />}>
      <Preview />
    </Suspense>
  );
}

async function Preview() {
  if (!(await getCurrentUser())) redirect("/admin/login?next=/admin/home");
  const [draft, live] = await Promise.all([readSettingForAdmin<unknown>("home_draft"), readSettingForAdmin<unknown>("home")]);
  const sections = parseHomeSections(draft) ?? parseHomeSections(live) ?? defaultSections();
  return (
    <>
      <PreviewBridge />
      <HomeSections sections={sections} />
    </>
  );
}
