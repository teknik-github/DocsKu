import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getSearchIndex } from "@/lib/data/site";
import { searchIndex } from "@/lib/search-engine";

/**
 * Requests for AI Chat built from reader statistics ("Saran AI" on
 * /admin/stats). The numbers come from the database here, never from the URL,
 * and the result only pre-fills the chat input: the person reads it and sends.
 */

const DAYS = 30;
const since = sql`(now() at time zone 'Asia/Jakarta')::date - ${DAYS - 1}::int`;
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

/** For the editor's AI Chat on that page: why readers stop or leave, and what to change. */
export async function readingAdvicePrompt(pageId: string): Promise<string | null> {
  const [row] = await db.execute<{
    title: string;
    slug: string;
    reads: number;
    d50: number;
    d100: number;
    exits: number;
    seconds: number;
    views: number;
    helpful: number;
    unhelpful: number;
  }>(sql`
    select p.title, p.slug,
      coalesce((select sum(reads) from page_reads where page_id = p.id and day >= ${since}), 0)::int as reads,
      coalesce((select sum(depth_50) from page_reads where page_id = p.id and day >= ${since}), 0)::int as d50,
      coalesce((select sum(depth_100) from page_reads where page_id = p.id and day >= ${since}), 0)::int as d100,
      coalesce((select sum(exits) from page_reads where page_id = p.id and day >= ${since}), 0)::int as exits,
      coalesce((select sum(seconds) from page_reads where page_id = p.id and day >= ${since}), 0)::int as seconds,
      coalesce((select sum(views) from page_views where page_id = p.id and day >= ${since}), 0)::int as views,
      (select count(*) from page_feedback where page_id = p.id and helpful and created_at > now() - interval '${sql.raw(String(DAYS))} days')::int as helpful,
      (select count(*) from page_feedback where page_id = p.id and not helpful and created_at > now() - interval '${sql.raw(String(DAYS))} days')::int as unhelpful
    from pages p where p.id = ${pageId} and p.kind = 'doc'`);
  if (!row) return null;
  const average = row.reads ? Math.round(row.seconds / row.reads) : 0;
  const votes = row.helpful + row.unhelpful;
  const facts = [
    `${row.views} kunjungan dan ${row.reads} kunjungan selesai dalam ${DAYS} hari terakhir`,
    row.reads ? `${pct(row.d50, row.reads)}% pembaca sampai setengah halaman dan hanya ${pct(row.d100, row.reads)}% sampai akhir` : "",
    row.reads ? `rata-rata dibaca ${average < 60 ? `${average} detik` : `${Math.round(average / 60)} menit`}` : "",
    row.reads ? `${pct(row.exits, row.reads)}% pembaca meninggalkan situs dari halaman ini` : "",
    votes ? `${pct(row.helpful, votes)}% penilaian "membantu" (${votes} penilaian)` : "",
  ].filter(Boolean);
  return [
    `Statistik halaman ini (${row.title}, /docs/${row.slug}): ${facts.join("; ")}.`,
    "Baca isi halaman ini, jelaskan singkat kemungkinan penyebab pembaca berhenti atau pergi, lalu usulkan perbaikan konkret sebagai usulan edit: judul dan pembuka yang langsung menjawab kebutuhan pembaca, bagian yang perlu dipecah atau dipindah ke atas, langkah yang kurang jelas, dan tautan ke halaman lanjutan di akhir.",
  ].join("\n\n");
}

/** For /admin/ai: a search that found pages, but readers never opened one. */
export async function searchAdvicePrompt(query: string): Promise<string | null> {
  const q = query.replace(/\s+/g, " ").trim().toLowerCase().slice(0, 100);
  if (q.length < 2) return null;
  const [stats] = await db.execute<{ searches: number }>(sql`
    select coalesce(sum(searches), 0)::int as searches from search_queries where query = ${q} and day >= ${since}`);
  const results = searchIndex(await getSearchIndex(), q, 5)
    .results.filter((result) => result.kind === "page")
    .map((result) => `- [${result.title}](${result.href})`);
  return [
    `Pembaca mencari “${q}” ${stats?.searches ?? 0} kali dalam ${DAYS} hari terakhir. Pencarian menemukan hasil, tetapi tidak ada yang diklik.`,
    results.length ? `Halaman yang muncul di hasil pencarian:\n${results.join("\n")}` : "Halaman yang muncul sekarang sudah tidak cocok lagi.",
    "Periksa halaman-halaman itu: apakah judul dan deskripsinya jelas menjawab pencarian tersebut? Usulkan judul dan deskripsi yang lebih jelas untuk halaman yang paling relevan, atau usulkan halaman baru bila belum ada yang benar-benar menjawabnya.",
  ].join("\n\n");
}
