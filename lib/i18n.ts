/**
 * Multi-language docs. The default language holds the originals; every other
 * enabled language has translations: their own `pages` rows (`locale`,
 * `translationOf` = the original) whose slug is `<code>/<original slug>`, so
 * `/docs/en/…` goes through the same route. Navigation stays one structure by
 * original page id and is resolved per language (lib/data/site.ts).
 *
 * Plain module (no "use client"): imported by server and client code alike.
 */

export type Language = { code: string; label: string };

export type LanguageSettings = {
  /** The language of the originals. */
  defaultLocale: string;
  defaultLabel: string;
  /** Extra languages, in switcher order. */
  languages: Language[];
  /** A page without a translation: left out of that language's navigation, or linked in the default language. */
  missing: "hide" | "fallback";
};

export const DEFAULT_LANGUAGES: LanguageSettings = { defaultLocale: "id", defaultLabel: "Bahasa Indonesia", languages: [], missing: "fallback" };

/** BCP 47-ish, lower case: "en", "ms", "pt-br", "zh-hant". */
export const LANGUAGE_CODE = /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/;

/** Common choices for the settings form; any valid code can be typed. */
export const LANGUAGE_SUGGESTIONS: Language[] = [
  { code: "en", label: "English" },
  { code: "ms", label: "Bahasa Melayu" },
  { code: "jv", label: "Basa Jawa" },
  { code: "su", label: "Basa Sunda" },
  { code: "ar", label: "العربية" },
  { code: "ja", label: "日本語" },
  { code: "zh", label: "中文" },
  { code: "ko", label: "한국어" },
  { code: "nl", label: "Nederlands" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
];

export const extraCodes = (settings: LanguageSettings) => settings.languages.map((language) => language.code);

/** The extra language a /docs path belongs to (`/docs/en`, `/docs/en/…`), or the default. */
export function localeFromPath(pathname: string, settings: Pick<LanguageSettings, "defaultLocale" | "languages">): string {
  const match = /^\/docs\/([^/]+)(?:\/|$)/.exec(pathname);
  const code = match?.[1];
  return code && settings.languages.some((language) => language.code === code) ? code : settings.defaultLocale;
}

/** Same, from a page slug ("en/panduan/instalasi"). */
export const localeFromSlug = (slug: string, settings: Pick<LanguageSettings, "defaultLocale" | "languages">) =>
  localeFromPath(`/docs/${slug}`, settings);

/** The slug of a translation of `slug` into `code`. */
export const translationSlug = (code: string, slug: string) => `${code}/${slug}`;

/** The docs hub of a language: /docs, or /docs/<code>. */
export const hubHref = (locale: string, defaultLocale: string) => (locale === defaultLocale ? "/docs" : `/docs/${locale}`);

/** For hreflang and the switcher: every published version of a page, keyed by language. */
export type Alternates = Record<string, string>;

// ---- Reader chrome strings ----

const id = {
  docs: "Dokumentasi",
  docsIntro: "Semua panduan dan referensi dalam satu tempat.",
  noPages: "Belum ada halaman yang diterbitkan.",
  onThisPage: "Di halaman ini",
  inThisSection: "Di bagian ini",
  prev: "Sebelumnya",
  next: "Berikutnya",
  home: "Beranda",
  search: "Cari",
  searchDocs: "Cari dokumentasi…",
  searchOrAsk: "Cari atau tanyakan sesuatu…",
  searchLabel: "Cari dokumentasi",
  askAi: "Tanya AI",
  askAiHint: "Jawaban langsung dari isi dokumentasi",
  askAiNoTitle: "Tidak ada judul yang cocok. Pilih Tanya AI untuk mencari di isi dokumentasi.",
  noResults: "Tidak ada hasil untuk “{q}”.",
  backToResults: "Hasil pencarian",
  askSearching: "Mencari jawaban di dokumentasi…",
  askMiss: "Dokumentasi belum membahas pertanyaan ini. Coba kata lain, atau buka artikel yang mungkin terkait di bawah.",
  askMaybeRelated: "Mungkin terkait",
  askSources: "Sumber",
  askDisclaimer: "Jawaban dibuat AI dari isi dokumentasi dan bisa keliru. Periksa artikel sumbernya.",
  updated: "Diperbarui",
  published: "Terbit",
  minRead: "{n} menit baca",
  readMore: "Baca selengkapnya",
  related: "Artikel terkait",
  popular: "Artikel populer",
  seeAll: "Lihat semua",
  articles: "{n} artikel",
  resources: "Sumber daya",
  menu: "Menu",
  openMenu: "Buka menu",
  closeMenu: "Tutup menu",
  language: "Bahasa",
  copyPage: "Salin halaman",
  copied: "Tersalin",
  helpful: "Apakah halaman ini membantu?",
  yes: "Ya",
  no: "Tidak",
  thanksHelpful: "Terima kasih! Bagian apa yang paling membantu?",
  thanksNotHelpful: "Terima kasih! Apa yang kurang atau perlu diperbaiki?",
  optional: "Opsional",
  send: "Kirim",
  thanks: "Terima kasih atas masukannya!",
  feedbackError: "Masukan belum terkirim. Coba lagi sebentar lagi.",
  comments: "Komentar",
  internal: "Artikel internal",
  internalNote: "Hanya anggota tim yang masuk yang bisa membaca halaman ini. Halaman ini tidak tampil di situs publik.",
  translationMissing: "Halaman ini belum tersedia dalam bahasa Anda.",
  feedbackLabel: "Masukan",
  thanksDone: "Terima kasih atas masukan Anda.",
  feedbackPrivate: "Pesan hanya dibaca oleh tim dokumentasi, tidak ditampilkan di situs.",
  skip: "Lewati",
  messageError: "Pesan belum terkirim. Coba lagi sebentar lagi.",
  pageNav: "Navigasi halaman",
  docSections: "Bagian dokumentasi",
  allInternal: "Semua artikel internal",
  internalShort: "Artikel internal. Hanya terlihat oleh tim yang masuk, tidak tampil di situs publik.",
  readingTime: "Waktu baca",
  minutes: "{n} menit",
  otherPosts: "Tulisan lain",
  featured: "Unggulan",
  writeComment: "Tulis komentar",
  replyTo: "Balas {name}",
  reply: "Balas",
  commentPlaceholder: "Pertanyaan, koreksi, atau tambahan untuk halaman ini…",
  replyPlaceholder: "Tulis balasan…",
  name: "Nama",
  emailOptional: "Email (opsional, tidak ditampilkan)",
  sendComment: "Kirim komentar",
  sendReply: "Kirim balasan",
  cancel: "Batal",
  commentSent: "Komentar terkirim.",
  commentPending: "Terima kasih! Komentar Anda menunggu persetujuan.",
  commentError: "Komentar belum terkirim. Coba lagi sebentar lagi.",
  noComments: "Belum ada komentar. Jadilah yang pertama.",
  team: "Tim",
  commentAs: "Berkomentar sebagai",
  commentTeamNote: "Komentar Anda langsung tampil dengan label Tim.",
  commentModerated: "Komentar tampil setelah disetujui tim dokumentasi.",
  commentOpen: "Komentar langsung tampil. Komentar berisi tautan ditinjau dulu.",
  commentTooMany: "Terlalu banyak komentar. Coba lagi sebentar lagi.",
  commentTooFast: "Tunggu sebentar, lalu kirim lagi.",
  commentClosed: "Komentar sedang ditutup.",
  commentInvalid: "Periksa lagi: nama minimal 2 huruf, email harus valid jika diisi, dan komentar 2–2.000 karakter.",
  justNow: "baru saja",
  contentsOfPage: "Isi halaman",
  otherPagesIn: "Halaman lain di {section}",
  startHere: "Mulai di sini",
  open: "Buka",
  searchInDocs: "Cari di dokumentasi",
  docsOf: "Dokumentasi {name}",
  pageWord: "halaman",
  bookStats: "{parts} bagian · {chapters} bab · {pages} halaman",
  startReading: "Mulai membaca",
  contents: "Daftar isi",
  part: "Bagian {n}",
  chapter: "Bab {n}",
  nextChapter: "Bab berikutnya · Bab {n}",
  nextPage: "Halaman berikutnya",
  pageTurnHint: "← → untuk berpindah halaman",
  all: "Semua",
  noPagesInTopic: "Belum ada halaman di topik ini.",
  helpCenter: "Pusat bantuan",
  searchHelp: "Cari artikel, panduan, atau pertanyaan…",
  noArticles: "Belum ada artikel yang diterbitkan.",
  seeAllArticles: "Lihat semua {n} artikel",
  notFoundTitle: "Belum menemukan jawabannya?",
  notFoundText: "Coba kata kunci lain di pencarian, atau buka panduan lengkap kami.",
  searchAgain: "Cari lagi",
  mostRead: "Terpopuler",
  noStories: "Belum ada tulisan yang diterbitkan.",
  alsoRead: "Baca juga",
  azIndex: "Indeks A–Z",
  wikiStats: "{pages} halaman dalam {sections} bagian. Pilih huruf untuk melompat.",
  seeAlso: "Lihat juga",
  pageInfo: "Info halaman",
  topic: "Topik",
  section: "Bagian",
  hubIntro: "Semua panduan dan referensi, dikelompokkan per bagian.",
  readingProgress: "Progres membaca",
  nSections: "{n} bagian",
  helpHeadline: "Ada yang bisa kami bantu?",
  showLess: "Tampilkan lebih sedikit",
  guidebook: "Buku panduan",
  subheadings: "Subjudul",
  chapterOf: "Bab {n}, {title}",
  writtenBy: "Ditulis oleh",
  aboutAuthor: "Tentang penulis",
  allPostsBy: "Lihat semua tulisan",
  author: "Penulis",
  articlesBy: "Tulisan {name}",
  nArticles: "{n} artikel",
} as const;

export type I18nKey = keyof typeof id;

const en: Record<I18nKey, string> = {
  docs: "Documentation",
  docsIntro: "Every guide and reference in one place.",
  noPages: "Nothing has been published yet.",
  onThisPage: "On this page",
  inThisSection: "In this section",
  prev: "Previous",
  next: "Next",
  home: "Home",
  search: "Search",
  searchDocs: "Search documentation…",
  searchOrAsk: "Search or ask a question…",
  searchLabel: "Search documentation",
  askAi: "Ask AI",
  askAiHint: "An answer straight from the documentation",
  askAiNoTitle: "No matching titles. Choose Ask AI to search the documentation's content.",
  noResults: "No results for “{q}”.",
  backToResults: "Search results",
  askSearching: "Looking for an answer in the documentation…",
  askMiss: "The documentation doesn't cover this question yet. Try other words, or open a possibly related article below.",
  askMaybeRelated: "Possibly related",
  askSources: "Sources",
  askDisclaimer: "This answer was written by AI from the documentation and may be wrong. Check the source articles.",
  updated: "Updated",
  published: "Published",
  minRead: "{n} min read",
  readMore: "Read more",
  related: "Related articles",
  popular: "Popular articles",
  seeAll: "See all",
  articles: "{n} articles",
  resources: "Resources",
  menu: "Menu",
  openMenu: "Open menu",
  closeMenu: "Close menu",
  language: "Language",
  copyPage: "Copy page",
  copied: "Copied",
  helpful: "Was this page helpful?",
  yes: "Yes",
  no: "No",
  thanksHelpful: "Thank you! What helped the most?",
  thanksNotHelpful: "Thank you! What was missing or should be improved?",
  optional: "Optional",
  send: "Send",
  thanks: "Thanks for the feedback!",
  feedbackError: "Your feedback wasn't sent. Please try again shortly.",
  comments: "Comments",
  internal: "Internal article",
  internalNote: "Only signed-in team members can read this page. It isn't shown on the public site.",
  translationMissing: "This page isn't available in your language yet.",
  feedbackLabel: "Feedback",
  thanksDone: "Thanks for your feedback.",
  feedbackPrivate: "Messages are read only by the documentation team and never shown on the site.",
  skip: "Skip",
  messageError: "Your message wasn't sent. Please try again shortly.",
  pageNav: "Page navigation",
  docSections: "Documentation sections",
  allInternal: "All internal articles",
  internalShort: "Internal article. Visible only to signed-in team members, never on the public site.",
  readingTime: "Reading time",
  minutes: "{n} min",
  otherPosts: "More articles",
  featured: "Featured",
  writeComment: "Write a comment",
  replyTo: "Reply to {name}",
  reply: "Reply",
  commentPlaceholder: "A question, correction, or addition for this page…",
  replyPlaceholder: "Write a reply…",
  name: "Name",
  emailOptional: "Email (optional, never shown)",
  sendComment: "Post comment",
  sendReply: "Post reply",
  cancel: "Cancel",
  commentSent: "Comment posted.",
  commentPending: "Thank you! Your comment is awaiting approval.",
  commentError: "Your comment wasn't sent. Please try again shortly.",
  noComments: "No comments yet. Be the first.",
  team: "Team",
  commentAs: "Commenting as",
  commentTeamNote: "Your comment appears at once with the Team label.",
  commentModerated: "Comments appear after the documentation team approves them.",
  commentOpen: "Comments appear at once. Comments with links are reviewed first.",
  commentTooMany: "Too many comments. Please try again shortly.",
  commentTooFast: "Wait a moment, then send again.",
  commentClosed: "Comments are closed.",
  commentInvalid: "Please check: a name of at least 2 letters, a valid email if given, and a comment of 2–2,000 characters.",
  justNow: "just now",
  contentsOfPage: "Contents",
  otherPagesIn: "More in {section}",
  startHere: "Start here",
  open: "Open",
  searchInDocs: "Search the docs",
  docsOf: "{name} documentation",
  pageWord: "page",
  bookStats: "{parts} parts · {chapters} chapters · {pages} pages",
  startReading: "Start reading",
  contents: "Contents",
  part: "Part {n}",
  chapter: "Chapter {n}",
  nextChapter: "Next chapter · Chapter {n}",
  nextPage: "Next page",
  pageTurnHint: "← → to turn pages",
  all: "All",
  noPagesInTopic: "No pages in this topic yet.",
  helpCenter: "Help center",
  searchHelp: "Search articles, guides, or questions…",
  noArticles: "No articles published yet.",
  seeAllArticles: "See all {n} articles",
  notFoundTitle: "Didn't find your answer?",
  notFoundText: "Try other keywords, or browse our complete guides.",
  searchAgain: "Search again",
  mostRead: "Most read",
  noStories: "Nothing published yet.",
  alsoRead: "Read next",
  azIndex: "A–Z index",
  wikiStats: "{pages} pages in {sections} sections. Pick a letter to jump.",
  seeAlso: "See also",
  pageInfo: "Page info",
  topic: "Topic",
  section: "Section",
  hubIntro: "Every guide and reference, grouped by section.",
  readingProgress: "Reading progress",
  nSections: "{n} sections",
  helpHeadline: "How can we help?",
  showLess: "Show less",
  guidebook: "Guidebook",
  subheadings: "Subheadings",
  chapterOf: "Chapter {n}, {title}",
  writtenBy: "Written by",
  aboutAuthor: "About the author",
  allPostsBy: "See all articles",
  author: "Author",
  articlesBy: "Articles by {name}",
  nArticles: "{n} articles",
};

const DICTIONARIES: Record<string, Record<I18nKey, string>> = { id, en };

/**
 * A chrome string in `locale`. Languages without a dictionary use English
 * (a reader who picked another language more likely reads English than
 * Indonesian), except the default language, which is Indonesian here.
 */
export function t(locale: string | undefined, key: I18nKey, vars?: Record<string, string | number>): string {
  const dict = DICTIONARIES[locale ?? "id"] ?? (locale ? en : id);
  let text: string = dict[key] ?? id[key];
  if (vars) for (const [name, value] of Object.entries(vars)) text = text.replace(`{${name}}`, String(value));
  return text;
}

/** Dates in the reader's language. */
export const dateLocale = (locale: string | undefined) => (locale && locale !== "id" ? locale : "id-ID");
