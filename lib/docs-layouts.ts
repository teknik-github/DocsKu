/**
 * The /docs layouts ("Tata letak" under Tema). A plain module so the zod enum,
 * the picker (client) and the server branches share one list. To add one: an
 * entry here, a sketch in components/admin/theme-picker.tsx, and its hub and
 * article in components/publication/registry.tsx.
 */
export const DOCS_LAYOUTS = [
  { id: "docs", label: "Dokumentasi", description: "Sidebar kiri dan daftar isi di kanan. Cocok untuk referensi yang dijelajahi." },
  { id: "hybrid", label: "Hibrida", description: "Hub kartu per bagian; artikel di tengah dengan breadcrumb dan menu bagian." },
  { id: "ghost", label: "Ghost (blog)", description: "Seperti demo.ghost.io: hero, filter, grid kartu dengan halaman unggulan." },
  {
    id: "helpcenter",
    label: "Pusat bantuan",
    description: "Hero pencarian berwarna, kartu kategori berikon, artikel dalam kartu dengan daftar kategori dan artikel terkait.",
  },
  {
    id: "book",
    label: "Buku",
    description: "Bagian dan bab bernomor dengan daftar isi bergaya buku, progres membaca, dan tombol bab berikutnya yang besar.",
  },
  {
    id: "minimal",
    label: "Minimal",
    description: "Satu kolom tanpa sidebar: indeks teks sederhana, artikel yang fokus pada tulisan, navigasi bagian berupa pil.",
  },
  {
    id: "wiki",
    label: "Wiki",
    description: "Padat: pohon seluruh halaman di kiri, info halaman dan daftar isi di kanan, indeks A–Z.",
  },
  {
    id: "magazine",
    label: "Majalah",
    description: "Halaman depan editorial: cerita utama, kolom terpopuler, rak per topik; artikel dengan huruf awal besar.",
  },
  {
    id: "developer",
    label: "Pengembang",
    description: "Tiga kolom ala referensi API: navigasi bertingkat, konten lebar, dan panel kanan berisi daftar isi serta aksi halaman.",
  },
] as const;

export type DocsLayout = (typeof DOCS_LAYOUTS)[number]["id"];

export const DOCS_LAYOUT_IDS = DOCS_LAYOUTS.map((layout) => layout.id) as [DocsLayout, ...DocsLayout[]];

/** Layouts whose header tab links jump to that tab's block on the /docs hub (`#<topicSlug>`). */
export const HUB_ANCHOR_LAYOUTS: readonly DocsLayout[] = ["helpcenter", "magazine"];
