import type { JSONContent } from "@tiptap/core";

/** Starting content for the block-edited home page, modelled on the built-in home. */

const text = (value: string): JSONContent => ({ type: "text", text: value });
const paragraph = (value: string): JSONContent => ({ type: "paragraph", content: [text(value)] });
const heading = (value: string): JSONContent => ({ type: "heading", attrs: { level: 2 }, content: [text(value)] });
const card = (title: string, icon: string, href: string, description: string): JSONContent => ({
  type: "card",
  attrs: { title, icon, href, description },
});
const code = (title: string, language: string, value: string): JSONContent => ({
  type: "codeBlock",
  attrs: { language, title, highlight: null, lineNumbers: false },
  content: [text(value)],
});

export function homeTemplate(siteName: string): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "hero",
        attrs: {
          eyebrow: siteName,
          title: `Mulai membangun\ndengan ${siteName}`,
          subtitle: "Semua yang Anda butuhkan untuk memahami dan memakai produk ini. Dari langkah pertama sampai siap produksi.",
          showSearch: true,
          buttons: [
            { title: "Mulai cepat", href: "/docs/mulai-cepat", icon: "play" },
            { title: "Komponen", href: "/docs/menulis/komponen", icon: "puzzle" },
            { title: "Referensi API", href: "/docs/api/ikhtisar", icon: "code" },
          ],
        },
        content: [
          {
            type: "codeGroup",
            content: [
              code(
                "JavaScript",
                "js",
                'const res = await fetch("https://api.contoh.com/v1/items", {\n  headers: {\n    Authorization: `Bearer ${process.env.API_KEY}`,\n  },\n});\n\nconst { data } = await res.json();\nfor (const item of data) {\n  console.log(item.name);\n}',
              ),
              code(
                "Python",
                "python",
                'import os\nimport requests\n\nres = requests.get(\n    "https://api.contoh.com/v1/items",\n    headers={"Authorization": f"Bearer {os.environ[\'API_KEY\']}"},\n)\n\nfor item in res.json()["data"]:\n    print(item["name"])',
              ),
              code("cURL", "bash", 'curl https://api.contoh.com/v1/items \\\n  -H "Authorization: Bearer $API_KEY"'),
            ],
          },
        ],
      },
      heading("Pilih cara Anda belajar"),
      paragraph("Mulai dari panduan langkah demi langkah, atau langsung ke detail teknis."),
      {
        type: "cardGroup",
        attrs: { cols: 2 },
        content: [
          card("Panduan", "book", "/docs/pengenalan", "Pelajari konsep dasar, tulis halaman pertama Anda, lalu sesuaikan tampilan situs dokumentasi."),
          card("Referensi API", "terminal", "/docs/api/ikhtisar", "Detail setiap endpoint, parameter, dan respons. Cocok saat Anda sudah tahu apa yang ingin dibangun."),
        ],
      },
      heading("Dari ide sampai terbit"),
      paragraph("Ikuti urutannya, atau langsung lompat ke yang Anda butuhkan."),
      {
        type: "cardGroup",
        attrs: { cols: 4 },
        content: [
          card("1. Mulai", "compass", "/docs/pengenalan", "Pengenalan dan mulai cepat."),
          card("2. Tulis", "file", "/docs/menulis/halaman-baru", "Halaman, komponen, dan blok kode."),
          card("3. Sesuaikan", "palette", "/docs/kustomisasi/navigasi", "Navigasi, tema, dan warna."),
          card("4. Terbitkan", "rocket", "/docs/api/ikhtisar", "Referensi API dan catatan rilis."),
        ],
      },
      heading("Terus belajar"),
      {
        type: "cardGroup",
        attrs: { cols: 3 },
        content: [
          card("Catatan rilis", "star", "/docs/catatan-rilis", "Fitur dan perubahan terbaru."),
          card("Komponen", "puzzle", "/docs/menulis/komponen", "Callout, kartu, tab, dan langkah."),
          card("GitHub", "code", "https://github.com", "Kode sumber dan isu."),
        ],
      },
    ],
  };
}
