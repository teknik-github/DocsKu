import type { SiteSettings } from "@/lib/site-types";

/**
 * Initial site settings and navigation, imported once by `pnpm db:seed`.
 * After that, edit everything from the dashboard (/admin).
 *
 * Navigation here refers to pages by href; the seed script swaps each href for
 * the id of the page imported from db/seed/docs.
 */

export const seedSite: SiteSettings = {
  name: "Docsku",
  description: "Dokumentasi resmi Docsku.",
  headerCta: { title: "Referensi API", href: "/docs/api/ikhtisar" },
  resources: [
    { title: "Catatan rilis", href: "/docs/catatan-rilis", description: "Perubahan terbaru." },
    { title: "GitHub", href: "https://github.com", description: "Kode sumber proyek." },
  ],
  footer: [
    {
      title: "Dokumentasi",
      links: [
        { title: "Pengenalan", href: "/docs/pengenalan" },
        { title: "Mulai cepat", href: "/docs/mulai-cepat" },
        { title: "Referensi API", href: "/docs/api/ikhtisar" },
      ],
    },
    {
      title: "Sumber daya",
      links: [
        { title: "Catatan rilis", href: "/docs/catatan-rilis" },
        { title: "GitHub", href: "https://github.com" },
      ],
    },
  ],
};

type SeedItem = { title: string; href: string } | { title: string; items: SeedItem[] };
type SeedTab = { title: string; sections: { title: string; items: SeedItem[] }[] };

export const seedNavigation: SeedTab[] = [
  {
    title: "Panduan",
    sections: [
      {
        title: "Langkah pertama",
        items: [
          { title: "Pengenalan", href: "/docs/pengenalan" },
          { title: "Mulai cepat", href: "/docs/mulai-cepat" },
        ],
      },
      {
        title: "Menulis dokumentasi",
        items: [
          { title: "Membuat halaman baru", href: "/docs/menulis/halaman-baru" },
          { title: "Komponen", href: "/docs/menulis/komponen" },
          { title: "Blok kode", href: "/docs/menulis/blok-kode" },
        ],
      },
      {
        title: "Kustomisasi",
        items: [
          { title: "Navigasi", href: "/docs/kustomisasi/navigasi" },
          { title: "Tema dan warna", href: "/docs/kustomisasi/tema" },
        ],
      },
      {
        title: "Lainnya",
        items: [{ title: "Catatan rilis", href: "/docs/catatan-rilis" }],
      },
    ],
  },
  {
    title: "Referensi API",
    sections: [
      {
        title: "Dasar",
        items: [
          { title: "Ikhtisar", href: "/docs/api/ikhtisar" },
          { title: "Autentikasi", href: "/docs/api/autentikasi" },
        ],
      },
      {
        title: "Endpoint",
        items: [
          {
            title: "Item",
            items: [
              { title: "Daftar item", href: "/docs/api/item/daftar" },
              { title: "Buat item", href: "/docs/api/item/buat" },
            ],
          },
        ],
      },
    ],
  },
];
