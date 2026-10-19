import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Dashboard", template: "%s · Dashboard" },
  robots: { index: false, follow: false },
};

// The dashboard is rendered per user and redirects when signed out, so it opts
// out of instant-navigation validation.
export const instant = false;

export default function AdminRootLayout({ children }: LayoutProps<"/admin">) {
  return children;
}
