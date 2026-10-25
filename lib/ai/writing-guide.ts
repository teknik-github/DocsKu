/**
 * The page-writing "skill": how AI Chat (and AI Write, for whole sections)
 * writes page content so pages come out detailed instead of a few bullets.
 * Fixed text, so it never breaks the prompt-cache prefix. `components` says
 * whether the output goes through the MDX converter (AI Chat proposals) or
 * plain Markdown (AI Write inserts, where component tags would show as text).
 */
export function pageWritingGuide(components: boolean) {
  const steps = components
    ? `<Steps> dengan satu <Step title="…"> per tindakan; setiap langkah berisi penjelasan singkat lalu blok kode atau hasil yang diharapkan`
    : "daftar bernomor, satu tindakan per nomor, masing-masing dengan penjelasan dan blok kode atau hasil yang diharapkan";
  const callouts = components
    ? "<Tip>/<Note> untuk saran dan catatan, <Warning>/<Danger> untuk risiko (secukupnya, 2–4 per halaman)"
    : "kutipan (> **Tips:** …, > **Peringatan:** …) untuk saran dan risiko (secukupnya)";
  const variants = components
    ? "<CodeGroup> atau <Tabs> bila ada varian (mis. npm/pnpm/yarn, macOS/Linux/Windows)"
    : "subjudul ### per varian bila ada beberapa cara (mis. npm/pnpm/yarn, macOS/Linux/Windows)";
  const faq = components ? `satu <Accordion title="…pertanyaan…"> per masalah` : "### per masalah";
  const next = components
    ? "<CardGroup cols={2}> berisi <Card> ke halaman terkait yang benar-benar ada (cek dengan get_site_structure atau search_pages), atau daftar tautan biasa"
    : "daftar tautan ke halaman terkait yang disebut di konteks";

  return `Panduan menulis isi halaman (ikuti setiap kali menulis isi halaman utuh atau satu bagian utuh):
1. Rencanakan dulu: tentukan pembaca (pemula atau berpengalaman), tujuan halaman, dan kerangka 4–8 bagian ## sebelum menulis.${
    components ? " Bila topiknya bersinggungan dengan halaman lain di situs, baca dulu dengan search_pages/read_page agar istilah konsisten dan bisa ditautkan." : ""
  }
2. Tulis lengkap dan mendalam, bukan sekadar daftar poin. Halaman panduan atau konsep biasanya 900–1.800 kata. Setiap bagian ## menjelaskan apa dan mengapa, lalu memberi contoh konkret (perintah, kode, konfigurasi, atau contoh kasus); pakai ### untuk sub-bagian. Setiap poin dalam daftar diberi penjelasan satu-dua kalimat.
3. Susunan yang disarankan (sesuaikan dengan topik, lewati bagian yang tidak relevan):
   - Pembuka 2–3 kalimat tanpa judul: apa yang dipelajari pembaca dan hasil akhirnya.
   - ## Prasyarat: yang perlu disiapkan (versi, akses, pengetahuan dasar).
   - Bagian konsep atau inti, masing-masing dengan contoh.
   - Langkah-langkah memakai ${steps}.
   - Contoh kode lengkap yang bisa langsung disalin, dengan nama bahasa${components ? ' dan title="nama-file"' : ""}; ${variants}.
   - ${callouts}.
   - Tabel untuk membandingkan pilihan atau mendaftar parameter dan opsi konfigurasi.
   - ## Pemecahan masalah atau ## FAQ: 3–5 masalah yang umum, ${faq}.
   - ## Langkah selanjutnya: ${next}.
4. Akurat: jangan mengarang fakta, versi, angka, opsi, nama API, atau URL. Bila tidak yakin, tulis secara umum atau pakai placeholder dalam \`kode\` (mis. \`nama-proyek-anda\`)${
    components ? ", dan sebutkan asumsi Anda dalam ringkasan di chat" : ""
  }.
5. Bahasa Indonesia baku yang ramah, kalimat aktif, sapa pembaca dengan "Anda"; istilah teknis tetap dalam bentuk aslinya.${
    components
      ? `
6. propose_page_edit: dengan content_mode "append", tulis bagian baru yang sama lengkapnya; dengan "replace", pertahankan informasi penting yang sudah ada kecuali pengguna meminta menghapusnya.
7. Bila pengguna meminta tulisan singkat, kerangka saja, atau satu bagian kecil, ikuti permintaannya; panduan ini untuk halaman utuh.`
      : `
6. Bila yang diminta hanya potongan kecil (satu paragraf, satu daftar), cukup tulis itu saja dengan baik.`
  }`;
}
