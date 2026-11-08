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
import { readLanguages } from "@/lib/translations";
import { isAiReady } from "@/lib/ai/config";

export const metadata = { title: "Beranda" };

export default function HomePage({ searchParams }: PageProps<"/admin/home">) {
  return (
    <Suspense fallback={<div className="h-full animate-pulse bg-fill/40" />}>
      <Builder searchParams={searchParams} />
    </Suspense>
  );
}

async function Builder({ searchParams }: Pick<PageProps<"/admin/home">, "searchParams">) {
  await requireUser();
  const [{ bahasa }, languages] = await Promise.all([searchParams, readLanguages()]);
  // ?bahasa=<code>: the home of an extra language (/<code>), when that language is enabled.
  const locale = typeof bahasa === "string" && languages.languages.some((l) => l.code === bahasa) ? bahasa : undefined;
  const [draft, live, tabs, [legacy], aiReady] = await Promise.all([
    readSettingForAdmin<unknown>(locale ? `home_draft:${locale}` : "home_draft"),
    readSettingForAdmin<unknown>(locale ? `home:${locale}` : "home"),
    getNavigation(),
    db
      .select({ id: schema.pages.id })
      .from(schema.pages)
      .where(and(eq(schema.pages.kind, "home"), eq(schema.pages.status, "published"))),
    isAiReady(),
  ]);
  const draftSections = parseHomeSections(draft);
  const published = parseHomeSections(live);
  return (
    <HomeBuilder
      // A fresh builder per language: its own sections, draft and preview.
      key={locale ?? ""}
      initial={draftSections ?? published ?? (locale ? [] : defaultSections())}
      hasDraft={draftSections !== null}
      published={published}
      legacyHome={!locale && published === null && Boolean(legacy)}
      pages={allPages(tabs).map((page) => ({ href: page.href, title: page.title }))}
      locale={locale}
      languages={languages.languages.length ? [{ code: languages.defaultLocale, label: languages.defaultLabel }, ...languages.languages] : []}
      started={!locale || draftSections !== null || published !== null}
      aiReady={aiReady}
    />
  );
}
