import { Suspense } from "react";
import { getAskAiAvailable, getNavigation, getSearchIndex, getSiteSettings } from "@/lib/data/site";
import { SearchProvider } from "@/components/search";
import { SiteProvider } from "@/components/site-context";
import { SiteHeader } from "@/components/site-header";

export default async function SiteLayout({ children }: LayoutProps<"/">) {
  const [site, tabs, searchIndex, askAi] = await Promise.all([
    getSiteSettings(),
    getNavigation(),
    getSearchIndex(),
    getAskAiAvailable(),
  ]);

  return (
    <SiteProvider value={{ site, tabs }}>
      <SearchProvider index={searchIndex} ai={askAi}>
        <Suspense>
          <SiteHeader />
        </Suspense>
        <div className="pt-(--header-h)">{children}</div>
      </SearchProvider>
    </SiteProvider>
  );
}
