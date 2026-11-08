import { Suspense } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, ExternalLink, Eye, MessageSquareText, PenLine, Search, Sparkles, ThumbsDown, ThumbsUp, type LucideIcon } from "lucide-react";
import { requirePermission } from "@/lib/auth/dal";
import {
  FEEDBACK_FILTERS,
  RANGES,
  getAskStats,
  getFeedbackCounts,
  getSearchStats,
  getStatsOverview,
  getTopPages,
  listFeedback,
  type DailyViews,
  type FeedbackFilter,
  type Range,
  type SearchStat,
} from "@/lib/data/stats";
import { StatsFeedback } from "@/components/admin/stats-feedback";
import { Panel } from "@/components/admin/ui";

export const metadata = { title: "Statistik" };

const FEEDBACK_LABELS: Record<FeedbackFilter, string> = { all: "Semua", open: "Belum ditangani", messages: "Dengan pesan" };
const number = new Intl.NumberFormat("id-ID");
const shortDay = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "UTC" });
const longDay = new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const dayLabel = (day: string) => shortDay.format(new Date(`${day}T00:00:00Z`));
const share = (helpful: number, unhelpful: number) => (helpful + unhelpful ? Math.round((helpful / (helpful + unhelpful)) * 100) : null);

export default function StatsPage({ searchParams }: PageProps<"/admin/stats">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-fill" />}>
      <Stats searchParams={searchParams} />
    </Suspense>
  );
}

async function Stats({ searchParams }: Pick<PageProps<"/admin/stats">, "searchParams">) {
  await requirePermission("stats.view");
  const params = await searchParams;
  const range: Range = RANGES.find((r) => String(r) === params.range) ?? 30;
  const filter: FeedbackFilter = FEEDBACK_FILTERS.find((f) => f === params.feedback) ?? "open";
  const [overview, pages, searches, asks, feedback, feedbackCounts] = await Promise.all([
    getStatsOverview(range),
    getTopPages(range),
    getSearchStats(range),
    getAskStats(range),
    listFeedback(filter),
    getFeedbackCounts(),
  ]);
  const href = (next: { range?: Range; feedback?: FeedbackFilter }) => `/admin/stats?range=${next.range ?? range}&feedback=${next.feedback ?? filter}`;
  const change = overview.previous ? Math.round(((overview.views - overview.previous) / overview.previous) * 100) : null;
  const helpful = share(overview.helpful, overview.unhelpful);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-light tracking-tight text-fg">Statistik</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-fg-muted">
            Kunjungan, masukan, dan pencarian pembaca. Dihitung tanpa cookie; kunjungan dari akun dasbor dan bot tidak ikut dihitung.
          </p>
        </div>
        <nav className="flex gap-1 rounded-lg bg-fill p-1" aria-label="Rentang waktu">
          {RANGES.map((r) => (
            <Link
              key={r}
              href={href({ range: r })}
              aria-current={r === range ? "true" : undefined}
              className={`rounded-md px-3 py-1 text-sm transition-colors ${r === range ? "bg-surface font-medium text-fg shadow-sm" : "text-fg-muted hover:text-fg"}`}
            >
              {r} hari
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card
          icon={Eye}
          label="Kunjungan"
          value={number.format(overview.views)}
          note={
            change === null ? (
              `${range} hari terakhir`
            ) : (
              <span className={`inline-flex items-center gap-0.5 ${change >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                {change >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
                {Math.abs(change)}% dari {range} hari sebelumnya
              </span>
            )
          }
        />
        <Card
          icon={ThumbsUp}
          label="Membantu"
          value={helpful === null ? "—" : `${helpful}%`}
          note={overview.helpful + overview.unhelpful ? `${overview.helpful} ya · ${overview.unhelpful} tidak` : "Belum ada penilaian"}
        />
        <Card icon={MessageSquareText} label="Pesan belum ditangani" value={number.format(overview.open)} note="Dari semua waktu" highlight={overview.open > 0} />
        <Card
          icon={Search}
          label="Pencarian"
          value={number.format(searches.searches)}
          note={`${number.format(searches.missed)} tanpa hasil${asks.asks ? ` · ${number.format(asks.asks)} Tanya AI` : ""}`}
        />
      </div>

      <Panel className="p-5">
        <ViewsChart daily={overview.daily} />
      </Panel>

      <Panel>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-sm font-medium text-fg">Halaman teratas</h2>
          <span className="text-xs text-fg-subtle">{range} hari terakhir</span>
        </div>
        {pages.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-fg-subtle">Belum ada kunjungan atau penilaian di rentang ini.</p>
        ) : (
          <ol className="divide-y divide-line">
            {pages.map((page, i) => {
              const s = share(page.helpful, page.unhelpful);
              const width = `${Math.max(3, (page.views / Math.max(1, pages[0].views)) * 100)}%`;
              return (
                <li key={page.id} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-5 py-3 sm:grid-cols-[1.5rem_minmax(0,1fr)_10rem_7rem]">
                  <span className="text-right text-xs text-fg-subtle tabular-nums">{i + 1}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Link href={`/admin/pages/${page.id}`} className="truncate text-sm text-fg hover:text-accent">
                        {page.title || "Tanpa judul"}
                      </Link>
                      <a href={`/docs/${page.slug}`} target="_blank" rel="noreferrer" aria-label="Buka di situs" className="shrink-0 text-fg-subtle hover:text-fg">
                        <ExternalLink className="size-3" />
                      </a>
                    </div>
                    <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-fill sm:hidden">
                      <span className="block h-full rounded-full bg-accent/70" style={{ width }} />
                    </span>
                  </div>
                  <div className="hidden items-center gap-2 sm:flex">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-fill">
                      <span className="block h-full rounded-full bg-accent/70" style={{ width }} />
                    </span>
                    <span className="w-10 text-right text-sm text-fg tabular-nums">{number.format(page.views)}</span>
                  </div>
                  <span className="text-right text-sm text-fg tabular-nums sm:hidden">{number.format(page.views)}</span>
                  <div className="col-start-2 flex items-center gap-2 text-xs sm:col-start-auto sm:justify-end">
                    {s === null ? (
                      <span className="text-fg-subtle">—</span>
                    ) : (
                      <>
                        <span className="inline-flex items-center gap-1 text-fg-subtle tabular-nums" title={`${page.helpful} ya · ${page.unhelpful} tidak`}>
                          <ThumbsUp className="size-3" />
                          {page.helpful}
                          <ThumbsDown className="ml-1 size-3" />
                          {page.unhelpful}
                        </span>
                        <span
                          className={`rounded-full px-1.5 py-px font-medium tabular-nums ${
                            s >= 70
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                              : s >= 40
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                                : "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300"
                          }`}
                          title="Membantu"
                        >
                          {s}%
                        </span>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Panel>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-2">
        <QueryPanel
          icon={Search}
          title="Pencarian"
          summary={`${number.format(searches.searches)} pencarian, ${number.format(searches.missed)} tanpa hasil`}
          top={{ title: "Paling sering dicari", rows: searches.top, value: (r) => r.searches, empty: "Belum ada pencarian." }}
          misses={{ title: "Tanpa hasil", hint: "Dicari, tetapi belum ada di dokumentasi.", rows: searches.misses, value: (r) => r.misses, empty: "Semua pencarian menemukan hasil." }}
        />
        <QueryPanel
          icon={Sparkles}
          title="Tanya AI"
          summary={asks.asks ? `${number.format(asks.asks)} pertanyaan, ${number.format(asks.missed)} tidak terjawab` : "Belum ada pertanyaan di rentang ini"}
          top={{ title: "Paling sering ditanyakan", rows: asks.top, value: (r) => r.searches, empty: "Belum ada pertanyaan." }}
          misses={{ title: "Tidak terjawab", hint: "Belum dibahas artikel mana pun.", rows: asks.misses, value: (r) => r.misses, empty: "Semua pertanyaan terjawab." }}
        />
      </div>

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 className="text-sm font-medium text-fg">Masukan pembaca</h2>
          <div className="flex gap-1 rounded-lg bg-fill p-1">
            {FEEDBACK_FILTERS.map((f) => (
              <Link
                key={f}
                href={href({ feedback: f })}
                aria-current={f === filter ? "true" : undefined}
                className={`rounded-md px-2.5 py-0.5 text-xs transition-colors ${f === filter ? "bg-surface font-medium text-fg shadow-sm" : "text-fg-muted hover:text-fg"}`}
              >
                {FEEDBACK_LABELS[f]}
                <span className={`ml-1 tabular-nums ${f === "open" && feedbackCounts.open ? "text-accent" : "text-fg-subtle"}`}>{feedbackCounts[f]}</span>
              </Link>
            ))}
          </div>
        </div>
        <StatsFeedback items={feedback} />
      </Panel>
    </div>
  );
}

function Card({ icon: Icon, label, value, note, highlight = false }: { icon: LucideIcon; label: string; value: string; note: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border bg-surface p-4 ${highlight ? "border-accent/50" : "border-line"}`}>
      <Icon className={`size-4 ${highlight ? "text-accent" : "text-fg-subtle"}`} />
      <div className="mt-3 text-2xl font-semibold text-fg tabular-nums">{value}</div>
      <div className="text-sm text-fg-muted">{label}</div>
      <div className="mt-0.5 text-xs text-fg-subtle">{note}</div>
    </div>
  );
}

/** A round, even top for the chart's scale (2, 4, 6, 8, 10, 20, 40…), so the middle line is a whole number. */
function niceMax(value: number) {
  const target = Math.max(2, value);
  const step = 10 ** Math.floor(Math.log10(target));
  const candidates = [step / 10, step].flatMap((unit) => [2, 4, 6, 8, 10].map((m) => m * unit));
  return candidates.find((v) => v >= target && Number.isInteger(v / 2)) ?? 20 * step;
}

/** Views per day: bars on a light grid; a day's count shows on hover or keyboard focus. */
function ViewsChart({ daily }: { daily: DailyViews[] }) {
  const peak = daily.reduce((best, d) => (d.views > best.views ? d : best), daily[0] ?? { day: "", views: 0 });
  const scale = niceMax(peak.views);
  const total = daily.reduce((sum, d) => sum + d.views, 0);
  const ticks = daily.length > 1 ? [0, Math.floor((daily.length - 1) / 2), daily.length - 1] : [0];
  const fullDay = (day: string) => longDay.format(new Date(`${day}T00:00:00Z`));

  return (
    <figure>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 className="text-sm font-medium text-fg">Kunjungan per hari</h2>
        <p className="flex flex-wrap gap-x-4 text-xs text-fg-subtle tabular-nums">
          <span>
            Total <b className="font-medium text-fg">{number.format(total)}</b>
          </span>
          <span>
            Rata-rata <b className="font-medium text-fg">{number.format(Math.round((total / Math.max(1, daily.length)) * 10) / 10)}</b>/hari
          </span>
          {peak.views > 0 && (
            <span>
              Tertinggi <b className="font-medium text-fg">{number.format(peak.views)}</b> ({dayLabel(peak.day)})
            </span>
          )}
        </p>
      </div>
      <div className="mt-4 flex gap-2">
        <div className="flex h-44 w-6 flex-col justify-between text-right text-[10px] leading-none text-fg-subtle tabular-nums" aria-hidden>
          <span>{number.format(scale)}</span>
          <span>{number.format(scale / 2)}</span>
          <span>0</span>
        </div>
        <div
          role="img"
          aria-label={`${number.format(total)} kunjungan dalam ${daily.length} hari`}
          className="relative flex h-44 flex-1 items-end gap-px border-b border-line"
          style={{ backgroundImage: "linear-gradient(to bottom, var(--line) 1px, transparent 1px)", backgroundSize: "100% 50%" }}
        >
          {daily.map((d) => (
            <div key={d.day} tabIndex={0} className="group relative flex h-full flex-1 items-end outline-none" aria-label={`${fullDay(d.day)}: ${d.views} kunjungan`}>
              <div
                className="w-full rounded-t-sm bg-accent/60 transition-colors group-hover:bg-accent group-focus-visible:bg-accent"
                style={{ height: d.views ? `${Math.max(2, (d.views / scale) * 100)}%` : "1px", opacity: d.views ? 1 : 0.35 }}
              />
              <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-md bg-fg px-2 py-1 text-[11px] whitespace-nowrap text-page shadow group-hover:block group-focus-visible:block">
                {fullDay(d.day)} · <b>{number.format(d.views)}</b>
              </span>
            </div>
          ))}
        </div>
      </div>
      <figcaption className="mt-1.5 flex justify-between pl-8 text-xs text-fg-subtle">
        {ticks.map((i) => (
          <span key={i}>{daily[i] ? dayLabel(daily[i].day) : ""}</span>
        ))}
      </figcaption>
    </figure>
  );
}

type QueryList = { title: string; hint?: string; rows: SearchStat[]; value: (row: SearchStat) => number; empty: string };

/** "Most searched" next to "no results"; a miss goes straight to AI Chat as a writing request. */
function QueryPanel({ icon: Icon, title, summary, top, misses }: { icon: LucideIcon; title: string; summary: string; top: QueryList; misses: QueryList }) {
  return (
    <Panel>
      <div className="border-b border-line px-5 py-3">
        <h2 className="flex items-center gap-1.5 text-sm font-medium text-fg">
          <Icon className="size-4 text-accent" />
          {title}
        </h2>
        <p className="mt-0.5 text-xs text-fg-subtle">{summary}</p>
      </div>
      <div className="grid divide-y divide-line sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        {[top, misses].map((list, i) => (
          <div key={list.title} className="min-w-0">
            <div className="px-5 pt-3 pb-1">
              <h3 className="text-xs font-medium text-fg-muted">{list.title}</h3>
              {list.hint && <p className="text-[11px] text-fg-subtle">{list.hint}</p>}
            </div>
            {list.rows.length === 0 ? (
              <p className="px-5 py-5 text-xs text-fg-subtle">{list.empty}</p>
            ) : (
              <ul className="pb-2">
                {list.rows.map((row) => (
                  <li key={row.query} className="flex items-center gap-2 px-5 py-1.5 text-sm">
                    <span className="min-w-0 flex-1 truncate text-fg" title={row.query}>
                      {row.query}
                    </span>
                    <span className="text-xs text-fg-subtle tabular-nums">{number.format(list.value(row))}×</span>
                    {i === 1 && (
                      <Link
                        href={`/admin/ai?tulis=${encodeURIComponent(row.query)}`}
                        title="Minta AI menulis halaman tentang ini"
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-accent hover:bg-accent-soft"
                      >
                        <PenLine className="size-3" />
                        Tulis
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}
