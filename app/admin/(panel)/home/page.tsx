import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/dal";
import { ensureHomePage } from "@/lib/data/admin";
import { getSiteSettings } from "@/lib/data/site";

export const metadata = { title: "Beranda" };

/** Opens the home page in the editor, creating it from the template on first use. */
export default function HomeEditorRedirect() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-fill" />}>
      <OpenHome />
    </Suspense>
  );
}

async function OpenHome(): Promise<never> {
  const user = await requireUser();
  const site = await getSiteSettings();
  redirect(`/admin/pages/${await ensureHomePage(user.id, site.name)}`);
}
