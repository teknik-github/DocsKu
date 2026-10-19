import { getSiteSettings } from "@/lib/data/site";
import { DocsSidebar } from "@/components/sidebar";

/** The sidebar belongs to the "docs" layout; the hybrid and Ghost layouts use the full width. */
export default async function DocsLayout({ children }: LayoutProps<"/docs">) {
  const site = await getSiteSettings();
  if ((site.layout ?? "docs") !== "docs") return children;
  return (
    <>
      <DocsSidebar />
      <div className="lg:pl-64 xl:pl-72">{children}</div>
    </>
  );
}
