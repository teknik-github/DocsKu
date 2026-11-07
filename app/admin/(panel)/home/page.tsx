import { Suspense } from "react";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth/dal";
import { readSettingForAdmin } from "@/lib/data/admin";
import { getNavigation } from "@/lib/data/site";
import { allPages } from "@/lib/navigation";
import { parseHomeSections } from "@/lib/home-schema";
import { defaultSections } from "@/lib/home-sections";
import { HomeBuilder } from "@/components/admin/home-builder";

export const metadata = { title: "Beranda" };

export default function HomePage() {
  return (
    <Suspense fallback={<div className="h-full animate-pulse bg-fill/40" />}>
      <Builder />
    </Suspense>
  );
}

async function Builder() {
  await requireUser();
  const [draft, live, tabs, [legacy]] = await Promise.all([
    readSettingForAdmin<unknown>("home_draft"),
    readSettingForAdmin<unknown>("home"),
    getNavigation(),
    db
      .select({ id: schema.pages.id })
      .from(schema.pages)
      .where(and(eq(schema.pages.kind, "home"), eq(schema.pages.status, "published"))),
  ]);
  const draftSections = parseHomeSections(draft);
  const published = parseHomeSections(live);
  return (
    <HomeBuilder
      initial={draftSections ?? published ?? defaultSections()}
      hasDraft={draftSections !== null}
      published={published}
      legacyHome={published === null && Boolean(legacy)}
      pages={allPages(tabs).map((page) => ({ href: page.href, title: page.title }))}
    />
  );
}
