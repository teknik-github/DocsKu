import type { Metadata } from "next";
import { Geist, Geist_Mono, Source_Serif_4 } from "next/font/google";
import { getSiteSettings } from "@/lib/data/site";
import { ThemeScript } from "@/components/theme";
import { colorThemeOf } from "@/lib/color-themes";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
});

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSiteSettings();
  return {
    // Needed for absolute social-preview URLs, e.g. images under /media.
    metadataBase: process.env.SITE_URL ? new URL(process.env.SITE_URL) : undefined,
    title: { default: `${site.name} Docs`, template: `%s · ${site.name} Docs` },
    description: site.description,
    openGraph: { siteName: `${site.name} Docs` },
    // Lets browsers and feed readers find "Apa yang baru" from any page.
    alternates: { types: { "application/rss+xml": [{ url: "/rss.xml", title: `${site.name} Docs` }] } },
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Cached ("settings" tag), so it stays part of the static shell; Tema → Warna updates it.
  const site = await getSiteSettings();
  return (
    <html
      lang="id"
      data-color={colorThemeOf(site.colorTheme)}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${sourceSerif.variable} h-full antialiased`}
    >
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full bg-page font-sans text-fg">{children}</body>
    </html>
  );
}
