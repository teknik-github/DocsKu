import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { readSettingForAdmin } from "@/lib/data/admin";
import { HomeSections } from "@/components/home/sections";
import { PreviewBridge } from "@/components/home/preview-bridge";
import { parseHomeSections } from "@/lib/home-schema";
import { defaultSections } from "@/lib/home-sections";
import { readLanguages } from "@/lib/translations";

export const metadata: Metadata = { title: "Pratinjau beranda", robots: { index: false, follow: false } };

/**
 * The home builder's working copy, shown in the builder's frame (the only page
 * that may be framed, by this site only: see next.config.ts). Signed-in users only.
 */
export default function HomePreviewPage({ searchParams }: PageProps<"/preview/beranda">) {
  return (
    <Suspense fallback={<div className="h-screen animate-pulse bg-fill/40" />}>
      <Preview searchParams={searchParams} />
    </Suspense>
  );
}

async function Preview({ searchParams }: Pick<PageProps<"/preview/beranda">, "searchParams">) {
  if (!(await getCurrentUser())) redirect("/admin/login?next=/admin/home");
  const [{ bahasa }, languages] = await Promise.all([searchParams, readLanguages()]);
  // ?bahasa=<code>: an extra language's home draft, with that language's navigation and chrome.
  const locale = typeof bahasa === "string" && languages.languages.some((l) => l.code === bahasa) ? bahasa : undefined;
  const [draft, live] = await Promise.all([
    readSettingForAdmin<unknown>(locale ? `home_draft:${locale}` : "home_draft"),
    readSettingForAdmin<unknown>(locale ? `home:${locale}` : "home"),
  ]);
  const sections = parseHomeSections(draft) ?? parseHomeSections(live) ?? (locale ? [] : defaultSections());
  return (
    <div lang={locale}>
      <PreviewBridge />
      <HomeSections sections={sections} locale={locale} />
    </div>
  );
}
