/** Icon names (components/icon.tsx) for categories: the navigation has no icon field. */

const KEYWORD_ICONS: [RegExp, string][] = [
  [/mulai|langkah|pengenalan|dasar|awal|start|intro/, "rocket"],
  [/api|referensi|endpoint|sdk|integrasi/, "code"],
  [/tulis|konten|menulis|halaman|artikel/, "file"],
  [/kustom|tema|tampilan|desain|warna/, "palette"],
  [/rilis|pembaruan|changelog|baru/, "star"],
  [/keamanan|akun|login|autentikasi|izin/, "lock"],
  [/data|database|basis/, "database"],
  [/terminal|cli|perintah|deploy|server|docker|instal/, "terminal"],
  [/pengaturan|konfigurasi|setting/, "settings"],
  [/masalah|error|bantuan|faq|tanya|troubleshoot/, "lightbulb"],
  [/\bai\b|otomat/, "sparkles"],
];
const FALLBACK_ICONS = ["book", "layers", "compass", "boxes", "puzzle", "zap", "globe", "wrench"];

/** The keyword icon for a title, else one picked from its letters, so a category looks the same everywhere. */
export function categoryIcon(title: string) {
  const name = title.toLowerCase();
  const keyword = KEYWORD_ICONS.find(([pattern]) => pattern.test(name))?.[1];
  if (keyword) return keyword;
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return FALLBACK_ICONS[hash % FALLBACK_ICONS.length];
}
