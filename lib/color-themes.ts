/**
 * Colour themes for the whole site and dashboard (settings key "site",
 * field `colorTheme`). The tokens live in app/globals.css as
 * `:root[data-color="…"]` (light) and `:root.dark[data-color="…"]` (dark);
 * "terakota" is the default `:root`/`.dark` palette itself. The swatch
 * values here only draw the picker in /admin/theme.
 * To add a theme: a CSS block for light and dark, an entry here (the zod
 * enum in saveColorTheme is derived from it).
 */
export const COLOR_THEMES = [
  {
    id: "terakota",
    name: "Terakota",
    description: "Gading hangat dengan aksen tanah liat. Bawaan.",
    light: { page: "#faf9f5", accent: "#d97757", soft: "#f5e3db" },
    dark: { page: "#1f1e1d", accent: "#d97757", soft: "#3d2a22" },
  },
  {
    id: "samudra",
    name: "Samudra",
    description: "Biru tenang dan netral sejuk, cocok untuk produk teknis.",
    light: { page: "#f7f9fc", accent: "#2563eb", soft: "#dde8fb" },
    dark: { page: "#181b21", accent: "#2f6bdc", soft: "#1d2a45" },
  },
  {
    id: "zamrud",
    name: "Zamrud",
    description: "Hijau segar dengan nuansa alami.",
    light: { page: "#f6faf7", accent: "#047857", soft: "#d3eee2" },
    dark: { page: "#18201c", accent: "#0c7f5e", soft: "#183429" },
  },
  {
    id: "toska",
    name: "Toska",
    description: "Biru kehijauan yang bersih dan modern.",
    light: { page: "#f5fafb", accent: "#0e7490", soft: "#d4ecf2" },
    dark: { page: "#172023", accent: "#1a8199", soft: "#15333b" },
  },
  {
    id: "anggur",
    name: "Anggur",
    description: "Ungu yang hidup untuk merek kreatif.",
    light: { page: "#f9f8fd", accent: "#7c3aed", soft: "#ebe2fd" },
    dark: { page: "#1d1b24", accent: "#7f4ff0", soft: "#2c2446" },
  },
  {
    id: "mawar",
    name: "Mawar",
    description: "Merah mawar yang hangat dan berani.",
    light: { page: "#fdf8f9", accent: "#e11d48", soft: "#fbdfe6" },
    dark: { page: "#221a1c", accent: "#d92d52", soft: "#42212a" },
  },
  {
    id: "amber",
    name: "Amber",
    description: "Oranye keemasan, ramah dan bersemangat.",
    light: { page: "#fcfaf5", accent: "#b45309", soft: "#f8e6cc" },
    dark: { page: "#211d17", accent: "#b25a0e", soft: "#3f2c14" },
  },
  {
    id: "grafit",
    name: "Grafit",
    description: "Abu-abu netral tanpa warna, sederhana dan formal.",
    light: { page: "#fafafa", accent: "#3f3f46", soft: "#e9e9ec" },
    dark: { page: "#1c1c1e", accent: "#6b6b74", soft: "#2e2e33" },
  },
] as const;

export type ColorThemeId = (typeof COLOR_THEMES)[number]["id"];
export const DEFAULT_COLOR_THEME: ColorThemeId = "terakota";
export const COLOR_THEME_IDS = COLOR_THEMES.map((t) => t.id) as [ColorThemeId, ...ColorThemeId[]];

/** A stored value that is a known theme, or the default. */
export const colorThemeOf = (value: unknown): ColorThemeId =>
  COLOR_THEME_IDS.includes(value as ColorThemeId) ? (value as ColorThemeId) : DEFAULT_COLOR_THEME;
