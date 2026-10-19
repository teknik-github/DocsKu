/**
 * Colours for generated covers (Pengaturan → Otomatisasi → Sampul otomatis).
 * The stored choice is a preset id, "mixed" (a preset per page, picked from the
 * title), or a custom "#rrggbb". Safe to import anywhere.
 */

export const COVER_PRESETS = [
  { id: "terracotta", label: "Terakota", accent: "#d97757" },
  { id: "ocean", label: "Samudra", accent: "#2f7fc1" },
  { id: "forest", label: "Hutan", accent: "#3f8f5f" },
  { id: "violet", label: "Ungu", accent: "#7c5cc4" },
  { id: "rose", label: "Mawar", accent: "#d0567f" },
  { id: "amber", label: "Kuning", accent: "#d99a1e" },
  { id: "slate", label: "Abu", accent: "#5b6675" },
] as const;

export const DEFAULT_COVER_COLOR = "terracotta";
export const MIXED_COVER_COLOR = "mixed";
export const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function isCoverColor(value: string) {
  return value === MIXED_COVER_COLOR || HEX_COLOR.test(value) || COVER_PRESETS.some((p) => p.id === value);
}

/** Stable number from a string, for picking per-page colours and angles. */
export function stableHash(text: string) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}

type Rgb = [number, number, number];
const toRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const toHex = (rgb: Rgb) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t) as Rgb;
const rgba = (rgb: Rgb, alpha: number) => `rgba(${rgb.map(Math.round).join(",")},${alpha})`;
const luminance = (rgb: Rgb) =>
  rgb
    .map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    })
    .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);

/** The accent colour for a page: the chosen preset or custom colour, or one per title for "mixed". */
export function coverAccent(choice: string | undefined, title: string) {
  if (choice && HEX_COLOR.test(choice)) return choice.toLowerCase();
  if (choice === MIXED_COVER_COLOR) return COVER_PRESETS[stableHash(title) % COVER_PRESETS.length].accent;
  return (COVER_PRESETS.find((p) => p.id === choice) ?? COVER_PRESETS[0]).accent;
}

const PAGE: Rgb = [250, 249, 245];

/**
 * Background gradient, badge colour, and a label colour dark enough to read on
 * the light background (custom colours can be very light).
 */
export function coverStyle(accentHex: string, angle: number) {
  const accent = toRgb(accentHex);
  const soft = mix(accent, [255, 255, 255], 0.8);
  let label = accent;
  for (let i = 0; i < 12 && luminance(label) > 0.18; i++) label = mix(label, [0, 0, 0], 0.15);
  let badge = accent;
  for (let i = 0; i < 12 && luminance(badge) > 0.35; i++) badge = mix(badge, [0, 0, 0], 0.15);
  return {
    background: `linear-gradient(${angle}deg, ${rgba(accent, 0.38)}, ${rgba(soft, 0.55)} 55%, ${rgba(PAGE, 0.9)})`,
    page: toHex(PAGE),
    badge: toHex(badge),
    label: toHex(label),
  };
}
