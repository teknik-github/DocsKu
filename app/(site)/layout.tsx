import { Suspense } from "react";
import { getNavigation, getSearchIndex, getSiteSettings } from "@/lib/data/site";
import { SearchProvider } from "@/components/search";
import { SiteProvider } from "@/components/site-context";
import { SiteHeader } from "@/components/site-header";

export default async function SiteLayout({ children }: LayoutProps<"/">) {
  const [site, tabs, searchIndex] = await Promise.all([
    getSiteSettings(),
    getNavigation(),
    getSearchIndex(),
  ]);

  return (
    <SiteProvider value={{ site, tabs }}>
      <SearchProvider index={searchIndex}>
        <Suspense>
          <SiteHeader />
        </Suspense>
        <div className="pt-(--header-h)">{children}</div>
      </SearchProvider>
    </SiteProvider>
  );
}
