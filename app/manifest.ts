import type { MetadataRoute } from "next";
import { getSiteSettings } from "@/lib/data/site";
import { PWA_ICON_SIZES, pwaColors } from "@/lib/pwa";

/** Web app manifest: the docs can be installed (Add to Home Screen) and open at /docs. */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const site = await getSiteSettings();
  const colors = pwaColors(site);
  return {
    name: `${site.name} Docs`,
    short_name: site.name.slice(0, 12),
    description: site.description,
    start_url: "/docs",
    scope: "/",
    display: "standalone",
    background_color: colors.background,
    theme_color: colors.accent,
    lang: "id",
    icons: PWA_ICON_SIZES.flatMap((size) => [
      { src: `/pwa-icon/${size}`, sizes: `${size}x${size}`, type: "image/png", purpose: "any" as const },
      { src: `/pwa-icon/${size}?maskable=1`, sizes: `${size}x${size}`, type: "image/png", purpose: "maskable" as const },
    ]),
  };
}
