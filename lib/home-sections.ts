import type { HomeSection, HomeSectionType } from "@/lib/site-types";

/**
 * The home page builder's section catalogue, shared by the dashboard builder
 * (client) and the public renderer (components/home/sections.tsx).
 */

export const SECTION_TYPES: { type: HomeSectionType; label: string; description: string; icon: string }[] = [
  { type: "hero", label: "Hero", description: "Judul besar, pencarian, dan tombol di bagian atas.", icon: "sparkles" },
  { type: "categories", label: "Kategori", description: "Kartu kategori otomatis dari menu Halaman.", icon: "layers" },
  { type: "articles", label: "Artikel", description: "Artikel populer, terbaru, unggulan, atau pilihan sendiri.", icon: "file" },
  { type: "features", label: "Kartu & fitur", description: "Grid kartu dengan ikon atau gambar dan tautan.", icon: "boxes" },
  { type: "textImage", label: "Teks + gambar", description: "Penjelasan di samping gambar, dengan tombol.", icon: "palette" },
  { type: "faq", label: "FAQ", description: "Pertanyaan yang bisa dibuka-tutup.", icon: "lightbulb" },
  { type: "stats", label: "Statistik", description: "Angka-angka penting dengan keterangan.", icon: "zap" },
  { type: "cta", label: "Ajakan (CTA)", description: "Kotak ajakan dengan tombol.", icon: "rocket" },
  { type: "content", label: "Konten bebas", description: "Markdown dengan komponen dokumentasi (callout, langkah, kode).", icon: "code" },
];

export const sectionLabel = (type: HomeSectionType) => SECTION_TYPES.find((t) => t.type === type)?.label ?? type;

/** Unique enough for section ids; crypto.randomUUID needs a secure context (not plain-http LAN access). */
export const sectionId = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const baseOf = (id?: string) => ({ id: id ?? sectionId(), hidden: false, width: "full" as const, tone: "plain" as const });

/** A new section of `type` with example content, ready to edit. */
export function newSection(type: HomeSectionType, id?: string): HomeSection {
  const base = () => baseOf(id);
  switch (type) {
    case "hero":
      return {
        ...base(),
        tone: "accent",
        type,
        eyebrow: "",
        title: "Ada yang bisa kami bantu?",
        subtitle: "",
        showSearch: true,
        searchLabel: "Cari artikel, panduan, atau pertanyaan…",
        showPopular: true,
        image: null,
        align: "center",
        buttons: [],
      };
    case "categories":
      return { ...base(), type, title: "Telusuri kategori", columns: 3, links: 5, groupByTab: true };
    case "articles":
      return { ...base(), type, title: "Artikel populer", source: "popular", pages: [], limit: 6, style: "list" };
    case "features":
      return {
        ...base(),
        type,
        title: "Mulai dari sini",
        subtitle: "",
        columns: 3,
        items: [
          { icon: "rocket", image: null, title: "Mulai cepat", text: "Langkah pertama memakai produk.", href: "/docs" },
          { icon: "book", image: null, title: "Panduan", text: "Penjelasan lengkap setiap fitur.", href: "/docs" },
          { icon: "code", image: null, title: "Referensi", text: "Detail teknis dan contoh kode.", href: "/docs" },
        ],
      };
    case "textImage":
      return { ...base(), type, title: "Judul bagian", text: "Tulis penjelasan singkat di sini.\n\nParagraf baru dipisah baris kosong.", image: null, imageSide: "right", buttons: [] };
    case "faq":
      return {
        ...base(),
        type,
        title: "Pertanyaan umum",
        items: [
          { question: "Bagaimana cara memulai?", answer: "Buka panduan Mulai cepat, lalu ikuti langkahnya." },
          { question: "Di mana saya bisa bertanya?", answer: "Gunakan pencarian atau Tanya AI di bagian atas halaman." },
        ],
      };
    case "stats":
      return { ...base(), type, title: "", items: [{ value: "100+", label: "Artikel" }, { value: "24/7", label: "Bisa diakses" }, { value: "5 menit", label: "Rata-rata waktu baca" }] };
    case "cta":
      return {
        ...base(),
        type,
        tone: "plain",
        title: "Tidak menemukan yang Anda cari?",
        text: "Telusuri seluruh dokumentasi, atau buka referensi lengkapnya.",
        buttons: [{ label: "Semua dokumentasi", href: "/docs", style: "primary" }],
      };
    case "content":
      return { ...base(), type, markdown: "## Judul\n\nTulis konten bebas dengan **Markdown**.\n\n<Tip>\nKomponen dokumentasi juga bisa dipakai, misalnya Tip, Note, Warning, Steps, dan Tabs.\n</Tip>" };
  }
}

/** The starting home: the help-centre layout (hero, categories, popular + latest side by side, help box). */
export function defaultSections(): HomeSection[] {
  // Fixed ids: "/" renders this while prerendering, where random or time-based values aren't allowed.
  return [
    newSection("hero", "default-hero"),
    newSection("categories", "default-categories"),
    { ...newSection("articles", "default-popular"), width: "half" },
    { ...newSection("articles", "default-latest"), width: "half", title: "Baru diterbitkan", source: "latest" } as HomeSection,
    newSection("cta", "default-cta"),
  ];
}

/** Site-relative paths, #anchors, http(s) and mailto links only. */
export const isSafeHref = (href: string) => /^(https?:\/\/|mailto:|\/(?!\/)|#)/i.test(href.trim());

/** An uploaded image (/media/…) or an https URL, without characters that could break out of CSS url(). */
export const isSafeImage = (src: string) => /^(\/media\/[\w.-]+|https:\/\/[^\s"'()\\]+)$/i.test(src);
