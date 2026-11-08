import { COLOR_THEMES, colorThemeOf } from "@/lib/color-themes";
import type { SiteSettings } from "@/lib/site-types";

/** Colours for the installed app (manifest, theme-color, icons), from Tema → Warna. */
export function pwaColors(site: SiteSettings) {
  const theme = COLOR_THEMES.find((entry) => entry.id === colorThemeOf(site.colorTheme)) ?? COLOR_THEMES[0];
  return { background: theme.light.page, accent: theme.light.accent };
}

export const PWA_ICON_SIZES = [192, 512] as const;
