import type { Metadata } from "next";
import { getSiteSettings, getWidgetSettings } from "@/lib/data/site";
import { WidgetFrame } from "@/components/widget/frame";

/**
 * The embeddable help widget, shown in a frame by /widget.js on other sites
 * (outside the (site) group: no site header or footer). Framing is limited to
 * the allowed origins by proxy.ts; every page here 404s while the widget is off.
 */
export const metadata: Metadata = { title: "Bantuan", robots: { index: false, follow: false } };

export default async function WidgetLayout({ children }: { children: React.ReactNode }) {
  const [widget, site] = await Promise.all([getWidgetSettings(), getSiteSettings()]);
  return (
    <WidgetFrame siteName={site.name} allowedOrigins={widget.allowedOrigins} accent={widget.accent}>
      {children}
    </WidgetFrame>
  );
}
