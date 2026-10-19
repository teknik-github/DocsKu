import "server-only";
import type { AiActionId } from "@/lib/ai/presets";
import type { ChatMessage } from "@/lib/ai/client";

const SYSTEM = `Anda adalah asisten penulis dokumentasi teknis untuk sebuah situs dokumentasi.
Aturan:
- Tulis dalam bahasa yang sama dengan teks atau instruksi pengguna, kecuali diminta menerjemahkan.
- Gaya: jelas, ringkas, langsung ke inti, ramah untuk developer. Tanpa basa-basi.
- Balas HANYA dengan isi yang diminta: tanpa kalimat pembuka, penutup, atau penjelasan tentang apa yang Anda lakukan.
- Gunakan Markdown standar bila perlu: judul (## atau ###), daftar, tabel, **tebal**, \`kode\`, dan blok kode berpagar dengan nama bahasa. Jangan pakai HTML.
- Jangan membungkus seluruh jawaban dalam satu blok kode.
- Jangan mengarang fakta, angka, URL, atau nama API yang tidak ada di konteks; gunakan placeholder yang jelas bila perlu.`;

const ACTIONS: Record<Exclude<AiActionId, "write" | "custom" | "description">, string> = {
  improve: "Perbaiki tulisan berikut agar lebih jelas, lancar, dan enak dibaca. Pertahankan makna, istilah teknis, dan format Markdown-nya.",
  grammar: "Perbaiki ejaan, tanda baca, dan tata bahasa teks berikut. Jangan ubah gaya, isi, atau format selain yang salah.",
  shorter: "Ringkas teks berikut menjadi kira-kira separuh panjangnya tanpa menghilangkan informasi penting.",
  longer: "Kembangkan teks berikut dengan penjelasan atau contoh yang relevan, tetap ringkas dan akurat.",
  simplify: "Tulis ulang teks berikut dengan bahasa yang lebih sederhana agar mudah dipahami pemula.",
  formal: "Tulis ulang teks berikut dengan nada yang lebih formal dan profesional.",
  casual: "Tulis ulang teks berikut dengan nada yang lebih santai dan bersahabat, tetap profesional.",
  "translate-en": "Terjemahkan teks berikut ke bahasa Inggris. Pertahankan format Markdown dan istilah teknis.",
  "translate-id": "Terjemahkan teks berikut ke bahasa Indonesia yang baku dan alami. Pertahankan format Markdown dan istilah teknis.",
};

export type AiRequest = {
  action: AiActionId;
  instruction?: string;
  selection?: string;
  /** Inline edits must stay a single run of text (no headings or lists). */
  inline?: boolean;
  title?: string;
  description?: string;
  /** The page so far, as Markdown (truncated by the caller). */
  document?: string;
};

function pageContext(req: AiRequest) {
  const parts = [
    req.title && `Judul halaman: ${req.title}`,
    req.description && `Deskripsi halaman: ${req.description}`,
    req.document && `Isi halaman saat ini (Markdown):\n"""\n${req.document}\n"""`,
  ].filter(Boolean);
  return parts.length ? parts.join("\n\n") : "";
}

export function buildMessages(req: AiRequest): ChatMessage[] {
  const context = pageContext(req);
  const inlineRule = req.inline
    ? "\n\nTeks ini bagian dari satu paragraf: balas sebagai teks sebaris tanpa judul, daftar, atau baris baru."
    : "";

  let task: string;
  if (req.action === "write") {
    task = `Tulis konten untuk disisipkan ke halaman ini sesuai instruksi berikut:\n${req.instruction}`;
  } else if (req.action === "description") {
    task =
      "Tulis satu kalimat deskripsi halaman (maksimal 160 karakter) yang merangkum isi halaman ini, untuk ditampilkan di bawah judul. Balas dengan kalimat itu saja, tanpa tanda kutip dan tanpa Markdown.";
  } else if (req.action === "custom") {
    task = `${req.instruction}\n\nTerapkan pada teks berikut dan balas dengan hasilnya saja:\n"""\n${req.selection}\n"""${inlineRule}`;
  } else {
    task = `${ACTIONS[req.action]}\n\nTeks:\n"""\n${req.selection}\n"""${inlineRule}`;
  }

  return [
    { role: "system", content: SYSTEM },
    { role: "user", content: context ? `${context}\n\n---\n\n${task}` : task },
  ];
}
