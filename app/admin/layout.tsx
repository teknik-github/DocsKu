import type { Metadata } from "next";
import { DialogHost } from "@/components/admin/dialog";

export const metadata: Metadata = {
  title: { default: "Dashboard", template: "%s · Dashboard" },
  robots: { index: false, follow: false },
};

// The dashboard is rendered per user and redirects when signed out, so it opts
// out of instant-navigation validation.
export const instant = false;

export default function AdminRootLayout({ children }: LayoutProps<"/admin">) {
  return (
    <>
      {/* Before first paint: a collapsed sidebar (cookie) also narrows the loading skeleton. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `if(/(?:^|; )docsku_sidebar=collapsed/.test(document.cookie))document.documentElement.classList.add("sidebar-collapsed")`,
        }}
      />
      {children}
      {/* confirmDialog()/promptDialog() from components/admin/dialog.tsx render here. */}
      <DialogHost />
    </>
  );
}
