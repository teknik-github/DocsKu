/**
 * Built-in page templates, written as MDX and converted with `mdxToDoc` (the
 * same converter AI proposals and the seed use), so every block is a node the
 * editor knows. Placeholder text is in Indonesian and follows the structure of
 * `pageWritingGuide()`: what the reader gets, prerequisites, steps, titled code,
 * callouts, FAQ, and "Langkah selanjutnya".
 *
 * Ids are stable ("builtin:<key>") because `createPage` receives them.
 */
export type BuiltinTemplate = {
  key: string;
  name: string;
  description: string;
  /** Icon name from TEMPLATE_ICONS (components/admin/template-icons.tsx). */
  icon: string;
  pageTitle: string;
  pageDescription: string;
  mdx: string;
};

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    key: "instalasi",
    name: "Panduan instalasi",
    description: "Prasyarat, langkah instalasi per sistem operasi, verifikasi, dan masalah umum.",
    icon: "package",
    pageTitle: "Instalasi [nama produk]",
    pageDescription: "Pasang [nama produk] di Windows, macOS, atau Linux, lalu pastikan semuanya berjalan.",
    mdx: `Panduan ini menjelaskan cara memasang **[nama produk]** dari awal sampai siap dipakai. Setelah selesai, Anda bisa [hasil yang didapat pembaca].

## Sebelum mulai

Pastikan Anda sudah punya:

- [Sistem operasi dan versi minimum]
- [Perangkat lunak pendukung, misalnya Node.js 20 atau lebih baru]
- Akses administrator ke komputer

<Note>Ganti teks dalam kurung siku dengan informasi produk Anda.</Note>

## Pasang [nama produk]

<Tabs>
  <Tab title="macOS">
    \`\`\`bash title="Terminal"
    brew install nama-produk
    \`\`\`
  </Tab>
  <Tab title="Windows">
    \`\`\`powershell title="PowerShell"
    winget install NamaProduk
    \`\`\`
  </Tab>
  <Tab title="Linux">
    \`\`\`bash title="Terminal"
    curl -fsSL https://contoh.com/install.sh | sh
    \`\`\`
  </Tab>
</Tabs>

## Konfigurasi awal

<Steps>
  <Step title="Buat berkas konfigurasi">
    Salin contoh konfigurasi lalu sesuaikan nilainya.

    \`\`\`bash title="Terminal"
    cp contoh.env .env
    \`\`\`
  </Step>
  <Step title="Isi pengaturan wajib">
    Jelaskan setiap pengaturan yang harus diisi dan contohnya.
  </Step>
  <Step title="Jalankan untuk pertama kali">
    \`\`\`bash title="Terminal"
    nama-produk start
    \`\`\`
  </Step>
</Steps>

## Pastikan instalasi berhasil

\`\`\`bash title="Terminal"
nama-produk --version
\`\`\`

<Check>Jika perintah di atas menampilkan nomor versi, instalasi berhasil.</Check>

## Masalah umum

<Accordion title="Perintah tidak dikenali setelah instalasi">
  Tutup lalu buka lagi terminal, atau tambahkan folder instalasi ke \`PATH\`.
</Accordion>
<Accordion title="Izin ditolak (permission denied)">
  Jalankan perintah dengan hak administrator, atau periksa pemilik folder instalasi.
</Accordion>

## Langkah selanjutnya

- [Tautan ke panduan memulai]
- [Tautan ke konfigurasi lanjutan]
`,
  },
  {
    key: "tutorial",
    name: "Tutorial langkah demi langkah",
    description: "Ajak pembaca membangun sesuatu dari nol, dengan hasil akhir yang jelas.",
    icon: "list-ordered",
    pageTitle: "Membuat [hasil akhir] dengan [nama produk]",
    pageDescription: "Tutorial singkat: dari nol sampai [hasil akhir] berjalan, kira-kira 15 menit.",
    mdx: `Dalam tutorial ini Anda akan membuat **[hasil akhir]**. Kira-kira butuh 15 menit.

## Yang akan Anda pelajari

- [Keterampilan pertama]
- [Keterampilan kedua]
- [Keterampilan ketiga]

## Prasyarat

- [Akun, alat, atau pengetahuan yang dibutuhkan]
- Sudah mengikuti [tautan ke panduan instalasi]

## Langkah-langkah

<Steps>
  <Step title="Siapkan proyek">
    Jelaskan apa yang dilakukan pembaca dan mengapa.

    \`\`\`bash title="Terminal"
    mkdir proyek-saya && cd proyek-saya
    \`\`\`
  </Step>
  <Step title="Tulis kode pertama">
    \`\`\`js title="index.js"
    console.log("Halo dari tutorial!");
    \`\`\`
  </Step>
  <Step title="Jalankan dan periksa hasilnya">
    \`\`\`bash title="Terminal"
    node index.js
    \`\`\`

    Anda akan melihat \`Halo dari tutorial!\` di terminal.
  </Step>
</Steps>

<Tip>Simpan pekerjaan Anda di setiap langkah agar mudah kembali jika ada yang salah.</Tip>

## Rangkuman

Anda sudah [ringkas hasil tutorial dalam satu atau dua kalimat].

## Langkah selanjutnya

- [Tutorial lanjutan]
- [Referensi terkait]
`,
  },
  {
    key: "faq",
    name: "FAQ",
    description: "Kumpulan pertanyaan yang sering diajukan, dikelompokkan per topik.",
    icon: "help-circle",
    pageTitle: "Pertanyaan yang sering diajukan",
    pageDescription: "Jawaban singkat untuk pertanyaan yang paling sering kami terima tentang [nama produk].",
    mdx: `Tidak menemukan jawabannya di sini? [Hubungi tim kami](mailto:halo@contoh.com).

## Umum

<Accordion title="Apa itu [nama produk]?">
  Jelaskan produk dalam satu atau dua kalimat.
</Accordion>
<Accordion title="Siapa yang cocok memakai [nama produk]?">
  Sebutkan jenis pengguna dan kebutuhan yang dijawab.
</Accordion>

## Akun dan tagihan

<Accordion title="Bagaimana cara mengganti paket?">
  Buka **Pengaturan → Tagihan**, lalu pilih paket baru.
</Accordion>
<Accordion title="Apakah ada uji coba gratis?">
  Jelaskan masa uji coba dan batasannya.
</Accordion>

## Teknis

<Accordion title="Sistem apa saja yang didukung?">
  Daftar sistem operasi, browser, atau versi yang didukung.
</Accordion>
<Accordion title="Di mana data saya disimpan?">
  Jelaskan lokasi dan keamanan data.
</Accordion>

<Note>Tambahkan pertanyaan baru dari pencarian tanpa hasil di **Statistik**.</Note>
`,
  },
  {
    key: "pemecahan-masalah",
    name: "Pemecahan masalah",
    description: "Gejala, penyebab, dan solusi untuk masalah yang sering ditemui.",
    icon: "wrench",
    pageTitle: "Mengatasi masalah [topik]",
    pageDescription: "Gejala yang sering muncul saat [topik], penyebabnya, dan cara memperbaikinya.",
    mdx: `Halaman ini membantu Anda mengatasi masalah yang sering muncul saat [topik]. Cari gejala yang paling mirip dengan yang Anda alami.

## Sebelum mulai

- Pastikan Anda memakai versi terbaru.
- Catat pesan galat lengkap yang muncul.

## [Gejala pertama, misalnya "Halaman tidak bisa dimuat"]

**Penyebab:** jelaskan penyebab paling umum.

**Solusi:**

<Steps>
  <Step title="Periksa koneksi">
    Jelaskan cara memeriksanya.
  </Step>
  <Step title="Bersihkan cache">
    \`\`\`bash title="Terminal"
    nama-produk cache clear
    \`\`\`
  </Step>
</Steps>

## [Gejala kedua, misalnya "Galat 401 Unauthorized"]

**Penyebab:** token kedaluwarsa atau salah.

**Solusi:** buat token baru di **Pengaturan → Token**, lalu ulangi permintaan.

<Warning>Jangan pernah membagikan token Anda di forum publik atau tangkapan layar.</Warning>

## Masih bermasalah?

Kirimkan detail berikut ke tim dukungan:

- Versi [nama produk] (\`nama-produk --version\`)
- Langkah untuk mengulangi masalah
- Pesan galat lengkap
`,
  },
  {
    key: "catatan-rilis",
    name: "Catatan rilis",
    description: "Apa yang baru, yang diperbaiki, dan yang perlu diperhatikan di sebuah versi.",
    icon: "megaphone",
    pageTitle: "Catatan rilis [versi]",
    pageDescription: "Fitur baru, perbaikan, dan perubahan penting di [nama produk] [versi].",
    mdx: `Dirilis pada [tanggal]. Ringkas perubahan terpenting dalam satu kalimat.

## Sorotan

<CardGroup cols={2}>
  <Card title="[Fitur utama]" icon="sparkles">Satu kalimat tentang manfaatnya bagi pengguna.</Card>
  <Card title="[Peningkatan besar]" icon="rocket">Satu kalimat tentang apa yang lebih baik.</Card>
</CardGroup>

## Baru

- **[Nama fitur]**: penjelasan singkat.
- **[Nama fitur]**: penjelasan singkat.

## Perbaikan

- Memperbaiki [masalah] saat [kondisi].
- Memperbaiki [masalah] di [bagian].

## Perubahan yang perlu diperhatikan

<Warning>Jelaskan perubahan yang bisa memengaruhi pengguna lama dan apa yang harus mereka lakukan.</Warning>

## Cara memperbarui

\`\`\`bash title="Terminal"
nama-produk update
\`\`\`
`,
  },
  {
    key: "referensi-api",
    name: "Referensi API",
    description: "Satu endpoint: parameter, contoh permintaan, respons, dan kode galat.",
    icon: "code",
    pageTitle: "[GET] /v1/[sumber-daya]",
    pageDescription: "Mengambil daftar [sumber daya] dengan paginasi dan filter.",
    mdx: `Mengambil daftar [sumber daya]. Membutuhkan token dengan izin \`read\`.

## Permintaan

\`\`\`http title="Endpoint"
GET https://api.contoh.com/v1/sumber-daya
\`\`\`

### Parameter

| Nama | Tipe | Wajib | Keterangan |
| --- | --- | --- | --- |
| \`limit\` | integer | Tidak | Jumlah item per halaman (bawaan 20, maks. 100). |
| \`cursor\` | string | Tidak | Penanda halaman berikutnya dari respons sebelumnya. |

## Contoh

<CodeGroup>
\`\`\`bash title="cURL"
curl "https://api.contoh.com/v1/sumber-daya?limit=2" \\
  -H "Authorization: Bearer $API_KEY"
\`\`\`

\`\`\`js title="JavaScript"
const res = await fetch("https://api.contoh.com/v1/sumber-daya?limit=2", {
  headers: { Authorization: \`Bearer \${process.env.API_KEY}\` },
});
const data = await res.json();
\`\`\`
</CodeGroup>

## Respons

\`\`\`json title="200 OK"
{
  "data": [{ "id": "sd_123", "nama": "Contoh" }],
  "next_cursor": "abc"
}
\`\`\`

## Kode galat

| Kode | Arti |
| --- | --- |
| \`401\` | Token tidak ada atau tidak valid. |
| \`429\` | Terlalu banyak permintaan; coba lagi nanti. |
`,
  },
  {
    key: "konsep",
    name: "Konsep / penjelasan",
    description: "Jelaskan sebuah gagasan: apa, mengapa penting, dan bagaimana cara kerjanya.",
    icon: "lightbulb",
    pageTitle: "Memahami [konsep]",
    pageDescription: "Apa itu [konsep], mengapa penting, dan bagaimana cara kerjanya di [nama produk].",
    mdx: `**[Konsep]** adalah [definisi satu kalimat]. Halaman ini menjelaskan cara kerjanya dan kapan Anda perlu memikirkannya.

## Mengapa penting

Jelaskan masalah yang diselesaikan konsep ini dan apa akibatnya jika diabaikan.

## Cara kerjanya

Uraikan prosesnya langkah demi langkah, atau dengan perumpamaan sederhana.

<Info title="Istilah penting">
  **[Istilah A]**: arti singkat. **[Istilah B]**: arti singkat.
</Info>

## Contoh

\`\`\`yaml title="contoh.yaml"
konsep:
  aktif: true
  mode: otomatis
\`\`\`

## Kapan memakainya

| Situasi | Saran |
| --- | --- |
| [Situasi pertama] | [Saran] |
| [Situasi kedua] | [Saran] |

## Langkah selanjutnya

- [Tutorial yang menerapkan konsep ini]
- [Referensi terkait]
`,
  },
];

export const builtinId = (key: string) => `builtin:${key}`;
