import type { Node as PMNode } from "@tiptap/pm/model";

/**
 * Writing checks for the page editor ("Periksa" → Kualitas, and before
 * publishing): things a reader or search engine would trip over. Runs on the
 * editor's document, so every issue can point at its block (`pos`).
 * Readability uses sentence length, which works for Indonesian and English
 * alike (Flesch-style syllable formulas don't fit Indonesian).
 */

export type QualityLevel = "error" | "warn" | "info";
export type QualityIssue = { id: string; level: QualityLevel; message: string; hint?: string; pos?: number };
export type Readability = { words: number; sentences: number; avgSentence: number; longSentences: number; label: "Mudah" | "Sedang" | "Sulit" | "—"; minutes: number };
export type QualityReport = { issues: QualityIssue[]; readability: Readability };

const TITLE_MAX = 70;
const DESCRIPTION_MIN = 50;
const DESCRIPTION_MAX = 160;
const LONG_SENTENCE = 30;
const LONG_PARAGRAPH = 150;
const SHORT_PAGE = 150;
const VAGUE_LINKS = /^(klik di sini|klik disini|di sini|disini|sini|link|tautan|here|click here|this link|baca|selengkapnya)$/i;

const wordsIn = (text: string) => text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word));
/** Sentences end with . ! ? or a line end; numbers like "1.5" and "v2.0" don't split. */
const sentencesIn = (text: string) =>
  text
    .split(/(?<=[.!?…])\s+(?=[\p{Lu}\p{N}"“(])|\n+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => wordsIn(sentence).length > 0);

export function checkQuality(input: { title: string; description: string; seoTitle?: string; seoDescription?: string; doc: PMNode; isHome?: boolean }): QualityReport {
  const issues: QualityIssue[] = [];
  const add = (issue: QualityIssue) => issues.push(issue);
  const title = input.title.trim();
  const description = input.description.trim();

  if (!title) add({ id: "title-empty", level: "error", message: "Judul masih kosong." });
  else if (title.length > TITLE_MAX && !input.seoTitle?.trim())
    add({ id: "title-long", level: "warn", message: `Judul ${title.length} karakter.`, hint: `Di hasil pencarian judul terpotong sekitar ${TITLE_MAX} karakter. Persingkat, atau isi meta title di Pengaturan halaman → SEO.` });

  if (!input.isHome) {
    if (!description && !input.seoDescription?.trim())
      add({ id: "description-empty", level: "warn", message: "Deskripsi masih kosong.", hint: "Deskripsi tampil di bawah judul, di kartu artikel, dan di hasil pencarian." });
    else if (description && description.length < DESCRIPTION_MIN)
      add({ id: "description-short", level: "info", message: `Deskripsi hanya ${description.length} karakter.`, hint: `Satu kalimat ${DESCRIPTION_MIN}–${DESCRIPTION_MAX} karakter yang menjelaskan isi halaman paling membantu.` });
    else if (description.length > DESCRIPTION_MAX && !input.seoDescription?.trim())
      add({ id: "description-long", level: "info", message: `Deskripsi ${description.length} karakter.`, hint: `Mesin pencari biasanya memotong setelah ${DESCRIPTION_MAX} karakter.` });
  }

  let previousLevel = 1;
  let firstHeading = true;
  const headingTexts = new Map<string, number>();
  let imagesWithoutAlt = 0;
  let firstImagePos: number | undefined;
  let allText = "";

  input.doc.descendants((node, pos) => {
    switch (node.type.name) {
      case "heading": {
        const level = Math.min(Math.max(Number(node.attrs.level) || 2, 1), 6);
        const text = node.textContent.trim();
        if (!text) add({ id: `heading-empty-${pos}`, level: "warn", message: "Ada judul bagian yang kosong.", pos });
        if (level === 1) add({ id: `heading-h1-${pos}`, level: "info", message: `“${text || "Judul"}” memakai Judul 1.`, hint: "Judul halaman sudah menjadi Judul 1; di situs bagian ini ditampilkan sebagai Judul 2. Pakai Judul 2.", pos });
        if (firstHeading && level > 2) add({ id: `heading-first-${pos}`, level: "warn", message: `Bagian pertama “${text}” langsung memakai Judul ${level}.`, hint: "Mulai dari Judul 2, lalu Judul 3 untuk sub-bagiannya. Daftar isi dan pembaca layar bergantung pada urutan ini.", pos });
        else if (!firstHeading && level > previousLevel + 1)
          add({ id: `heading-skip-${pos}`, level: "warn", message: `“${text}” melompat dari Judul ${previousLevel} ke Judul ${level}.`, hint: `Pakai Judul ${previousLevel + 1} agar struktur halaman runtut.`, pos });
        if (text) {
          const key = text.toLocaleLowerCase("id");
          if (headingTexts.has(key)) add({ id: `heading-dup-${pos}`, level: "info", message: `Judul bagian “${text}” muncul lebih dari sekali.`, hint: "Judul yang sama membuat daftar isi membingungkan.", pos });
          else headingTexts.set(key, pos);
        }
        previousLevel = Math.max(level, 2);
        firstHeading = false;
        allText += "\n";
        return false;
      }
      case "image": {
        if (!String(node.attrs.alt ?? "").trim()) {
          imagesWithoutAlt++;
          firstImagePos ??= pos;
        }
        return false;
      }
      case "codeBlock":
        return false;
      case "paragraph": {
        const text = node.textContent;
        const words = wordsIn(text).length;
        if (words > LONG_PARAGRAPH)
          add({ id: `paragraph-long-${pos}`, level: "info", message: `Paragraf ${words} kata: “${text.slice(0, 50).trim()}…”.`, hint: "Paragraf panjang sulit dibaca di layar. Pecah jadi beberapa paragraf, daftar, atau langkah.", pos });
        node.descendants((child) => {
          const link = child.marks.find((mark) => mark.type.name === "link");
          if (!link) return;
          const label = child.text?.trim() ?? "";
          if (!String(link.attrs.href ?? "").trim()) add({ id: `link-empty-${pos}`, level: "warn", message: `Tautan “${label}” tidak punya alamat.`, pos });
          else if (VAGUE_LINKS.test(label)) add({ id: `link-vague-${pos}-${label}`, level: "info", message: `Teks tautan “${label}” tidak menjelaskan tujuannya.`, hint: "Pakai teks yang menyebut tujuannya, misalnya “panduan instalasi”.", pos });
        });
        allText += `${text}\n`;
        return false;
      }
      default:
        return true;
    }
  });

  if (imagesWithoutAlt > 0)
    add({
      id: "image-alt",
      level: "warn",
      message: imagesWithoutAlt === 1 ? "Satu gambar belum punya teks alternatif." : `${imagesWithoutAlt} gambar belum punya teks alternatif.`,
      hint: "Teks alternatif dibacakan pembaca layar dan tampil jika gambar gagal dimuat. Klik gambar → Ubah teks alternatif.",
      pos: firstImagePos,
    });

  const sentences = sentencesIn(allText);
  const words = wordsIn(allText).length;
  const lengths = sentences.map((sentence) => wordsIn(sentence).length);
  const longSentences = lengths.filter((n) => n > LONG_SENTENCE).length;
  const avgSentence = sentences.length ? Math.round((words / sentences.length) * 10) / 10 : 0;
  const label: Readability["label"] = words < 30 ? "—" : avgSentence <= 15 && longSentences / sentences.length < 0.1 ? "Mudah" : avgSentence <= 22 ? "Sedang" : "Sulit";

  if (!input.isHome && words > 0 && words < SHORT_PAGE) add({ id: "page-short", level: "info", message: `Isi halaman baru ${words} kata.`, hint: "Halaman pendek boleh saja; pastikan pembaca tetap mendapat jawaban lengkap." });
  if (label === "Sulit") add({ id: "readability", level: "warn", message: `Kalimat rata-rata ${avgSentence} kata.`, hint: "Kalimat di bawah 20 kata lebih mudah dipahami. Pecah kalimat panjang menjadi dua." });
  else if (longSentences > 0) add({ id: "sentences-long", level: "info", message: `${longSentences} kalimat lebih dari ${LONG_SENTENCE} kata.`, hint: "Coba pecah kalimat panjang menjadi dua." });

  const order: Record<QualityLevel, number> = { error: 0, warn: 1, info: 2 };
  issues.sort((a, b) => order[a.level] - order[b.level] || (a.pos ?? -1) - (b.pos ?? -1));
  return { issues, readability: { words, sentences: sentences.length, avgSentence, longSentences, label, minutes: Math.max(1, Math.round(words / 200)) } };
}
