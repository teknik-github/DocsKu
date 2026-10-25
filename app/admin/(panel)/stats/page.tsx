import { Suspense } from "react";
import Link from "next/link";
import { ExternalLink, Eye, MessageSquareText, Search, ThumbsUp } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import {
  FEEDBACK_FILTERS,
  RANGES,
  getSearchStats,
  getStatsOverview,
  getTopPages,
  listFeedback,
  type DailyViews,
  type FeedbackFilter,
  type Range,
} from "@/lib/data/stats";
import { StatsFeedback } from "@/components/admin/stats-feedback";
import { PageHeader, Panel } from "@/components/admin/ui";

export const metadata = { title: "Statistik" };

const FEEDBACK_LABELS: Record<FeedbackFilter, string> = { all: "Semua", open: "Belum ditangani", messages: "Dengan pesan" };
const number = new Intl.NumberFormat("id-ID");
const shortDay = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "UTC" });
const dayLabel = (day: string) => shortDay.format(new Date(`${day}T00:00:00Z`));
const helpfulShare = (helpful: number, unhelpful: number) =>
  helpful + unhelpful ? `${Math.round((helpful / (helpful + unhelpful)) * 100)}%` : "—";

export default function StatsPage({ searchParams }: PageProps<"/admin/stats">) {
  return (
    <>
      <PageHeader
        title="Statistik"
        description="Kunjungan, masukan pembaca, dan pencarian di situs dokumentasi. Dihitung tanpa cookie; kunjungan dari akun dasbor tidak ikut dihitung."
      />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-fill" />}>
        <Stats searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Stats({ searchParams }: Pick<PageProps<"/admin/stats">, "searchParams">) {
  await requireUser();
  const params = await searchParams;
  const range: Range = RANGES.find((r) => String(r) === params.range) ?? 30;
  const filter: FeedbackFilter = FEEDBACK_FILTERS.find((f) => f === params.feedback) ?? "open";
  const [overview, pages, searches, feedback] = await Promise.all([
    getStatsOverview(range),
    getTopPages(range),
    getSearchStats(range),
    listFeedback(filter),
  ]);
  const href = (next: { range?: Range; feedback?: FeedbackFilter }) =>
    `/admin/stats?range=${next.range ?? range}&feedback=${next.feedback ?? filter}`;
  const change = overview.previous ? Math.round(((overview.views - overview.previous) / overview.previous) * 100) : null;

  const cards = [
    {
      label: "Kunjungan",
      value: number.format(overview.views),
      note: change === null ? `${range} hari terakhir` : `${change >= 0 ? "+" : ""}${change}% dari ${range} hari sebelumnya`,
      icon: Eye,
    },
    {
      label: "Membantu",
      value: helpfulShare(overview.helpful, overview.unhelpful),
      note: `${overview.helpful} ya · ${overview.unhelpful} tidak`,
      icon: ThumbsUp,
    },
    { label: "Pesan belum ditangani", value: number.format(overview.open), note: "Dari semua waktu", icon: MessageSquareText },
    {
      label: "Pencarian",
      value: number.format(searches.searches),
      note: `${number.format(searches.missed)} tanpa hasil`,
      icon: Search,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex w-fit gap-1 rounded-lg bg-fill p-1" aria-label="Rentang waktu">
        {RANGES.map((r) => (
          <Link
            key={r}
            href={href({ range: r })}
            className={`rounded-md px-3 py-1 text-sm transition-colors ${r === range ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg"}`}
          >
            {r} hari
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-line bg-surface p-4">
            <card.icon className="size-4 text-fg-subtle" />
            <div className="mt-3 text-2xl font-semibold text-fg tabular-nums">{card.value}</div>
            <div className="text-sm text-fg-muted">{card.label}</div>
            <div className="mt-0.5 text-xs text-fg-subtle">{card.note}</div>
          </div>
        ))}
      </div>

      <Panel className="p-5">
        <h2 className="text-sm font-medium text-fg">Kunjungan per hari</h2>
        <ViewsChart daily={overview.daily} />
      </Panel>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Panel>
          <div className="border-b border-line px-5 py-3">
            <h2 className="text-sm font-medium text-fg">Halaman teratas</h2>
          </div>
          {pages.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-fg-subtle">Belum ada kunjungan di rentang ini.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-fg-subtle">
                  <th className="px-5 py-2 font-normal">Halaman</th>
                  <th className="px-3 py-2 text-right font-normal">Kunjungan</th>
                  <th className="hidden px-3 py-2 text-right font-normal sm:table-cell">Ya / Tidak</th>
                  <th className="px-5 py-2 text-right font-normal">Membantu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {pages.map((page) => (
                  <tr key={page.id}>
                    <td className="max-w-0 px-5 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <Link href={`/admin/pages/${page.id}`} className="truncate text-fg hover:underline">
                          {page.title || "Tanpa judul"}
                        </Link>
                        <a href={`/docs/${page.slug}`} target="_blank" rel="noreferrer" aria-label="Buka di situs" className="shrink-0 text-fg-subtle hover:text-fg">
                          <ExternalLink className="size-3" />
                        </a>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right text-fg tabular-nums">{number.format(page.views)}</td>
                    <td className="hidden px-3 py-2.5 text-right text-fg-muted tabular-nums sm:table-cell">
                      {page.helpful} / {page.unhelpful}
                    </td>
                    <td className="px-5 py-2.5 text-right text-fg-muted tabular-nums">{helpfulShare(page.helpful, page.unhelpful)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <div className="space-y-6">
          <QueryList title="Pencarian teratas" rows={searches.top} value={(row) => row.searches} empty="Belum ada pencarian." />
          <QueryList
            title="Pencarian tanpa hasil"
            hint="Topik yang dicari pembaca tetapi belum ada di dokumentasi."
            rows={searches.misses}
            value={(row) => row.misses}
            empty="Semua pencarian menemukan hasil."
          />
        </div>
      </div>

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 className="text-sm font-medium text-fg">Masukan pembaca</h2>
          <div className="flex gap-1 rounded-lg bg-fill p-1">
            {FEEDBACK_FILTERS.map((f) => (
              <Link
                key={f}
                href={href({ feedback: f })}
                className={`rounded-md px-2.5 py-0.5 text-xs transition-colors ${f === filter ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg"}`}
              >
                {FEEDBACK_LABELS[f]}
              </Link>
            ))}
          </div>
        </div>
        <StatsFeedback items={feedback} />
      </Panel>
    </div>
  );
}

/** One bar per day; hover shows the date and count. */
function ViewsChart({ daily }: { daily: DailyViews[] }) {
  const peak = Math.max(0, ...daily.map((d) => d.views));
  const max = Math.max(1, peak);
  const total = daily.reduce((sum, d) => sum + d.views, 0);
  const ticks = [0, Math.floor((daily.length - 1) / 2), daily.length - 1];
  return (
    <figure className="mt-4">
      <p className="text-xs text-fg-subtle tabular-nums">Tertinggi {number.format(peak)} per hari</p>
      <div
        role="img"
        aria-label={`${number.format(total)} kunjungan dalam ${daily.length} hari`}
        className="mt-2 flex h-40 items-end gap-px border-b border-line"
      >
        {daily.map((d) => (
          <div key={d.day} title={`${dayLabel(d.day)}: ${number.format(d.views)} kunjungan`} className="group flex h-full flex-1 items-end">
            <div
              className="w-full rounded-t-sm bg-accent/70 transition-colors group-hover:bg-accent"
              style={{ height: d.views ? `${Math.max(2, (d.views / max) * 100)}%` : "1px", opacity: d.views ? 1 : 0.3 }}
            />
          </div>
        ))}
      </div>
      <figcaption className="mt-1.5 flex justify-between text-xs text-fg-subtle">
        {ticks.map((i) => (
          <span key={i}>{daily[i] ? dayLabel(daily[i].day) : ""}</span>
        ))}
      </figcaption>
    </figure>
  );
}

function QueryList<T extends { query: string }>({
  title,
  hint,
  rows,
  value,
  empty,
}: {
  title: string;
  hint?: string;
  rows: T[];
  value: (row: T) => number;
  empty: string;
}) {
  return (
    <Panel>
      <div className="border-b border-line px-5 py-3">
        <h2 className="text-sm font-medium text-fg">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-fg-subtle">{hint}</p>}
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-fg-subtle">{empty}</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((row) => (
            <li key={row.query} className="flex items-center gap-3 px-5 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-fg">{row.query}</span>
              <span className="text-fg-muted tabular-nums">{number.format(value(row))}×</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
