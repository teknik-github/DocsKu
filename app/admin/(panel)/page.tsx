import { connection } from "next/server";
import { Suspense } from "react";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Eye,
  FilePen,
  Globe,
  MessageSquare,
  MessageSquareText,
  Plus,
  Search,
  SearchX,
  Sparkles,
  ThumbsUp,
  TrendingUp,
  type LucideIcon,
  CalendarCheck,
  Link2Off,
} from "lucide-react";
import { countBrokenLinks } from "@/lib/review";
import { NewPageButton } from "@/components/admin/new-page-button";
import { requireUser } from "@/lib/auth/dal";
import { getNavCounts, getPageStats, listPages, listScheduledPages, readSettingForAdmin } from "@/lib/data/admin";
import { getAskStats, getSearchStats, getStatsOverview, getTopPages } from "@/lib/data/stats";
import { getSiteSettings } from "@/lib/data/site";
import { isAiReady } from "@/lib/ai/config";
import { readNavigation } from "@/lib/automation";
import { db, schema } from "@/db";
import { count } from "drizzle-orm";
import { formatDateTime } from "@/components/admin/format";
import { SetupChecklist, type SetupStep } from "@/components/admin/setup-checklist";
import { twoFactorStatus } from "@/lib/auth/two-factor";
import { Panel, StatusBadge, buttonClass } from "@/components/admin/ui";

export const metadata = { title: "Dasbor" };

const number = new Intl.NumberFormat("id-ID");
const TIME_ZONE = process.env.NEXT_PUBLIC_TIME_ZONE || "Asia/Jakarta";

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-fill" />}>
      <Dashboard />
    </Suspense>
  );
}

function greeting(now: Date) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: TIME_ZONE }).format(now));
  return hour < 11 ? "Selamat pagi" : hour < 15 ? "Selamat siang" : hour < 18 ? "Selamat sore" : "Selamat malam";
}

/** Seven days of views as a small line (no axes; the numbers are next to it). */
function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const w = 96;
  const h = 28;
  const points = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * w},${h - 2 - (v / max) * (h - 4)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-7 w-24 overflow-visible text-accent" aria-hidden>
      <polyline points={`0,${h} ${points} ${w},${h}`} className="fill-accent/10 stroke-none" />
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function StatCard({ icon: Icon, label, value, note, href, children }: { icon: LucideIcon; label: string; value: string; note: React.ReactNode; href: string; children?: React.ReactNode }) {
  return (
    <Link href={href} className="group flex flex-col rounded-xl border border-line bg-surface p-4 transition-colors hover:border-line-strong">
      <div className="flex items-start justify-between gap-2">
        <Icon className="size-4 text-fg-subtle" />
        {children}
      </div>
      <div className="mt-3 text-2xl font-semibold text-fg tabular-nums">{value}</div>
      <div className="text-sm text-fg-muted">{label}</div>
      <div className="mt-0.5 text-xs text-fg-subtle">{note}</div>
    </Link>
  );
}

async function Dashboard() {
  const user = await requireUser();
  const admin = user.role === "admin";
  const [stats, pages, scheduled, overview, top, searches, asks, counts, site, aiReady, navigation, home, users] = await Promise.all([
    getPageStats(),
    listPages(),
    listScheduledPages(),
    getStatsOverview(7),
    getTopPages(7, 5),
    getSearchStats(7),
    getAskStats(7),
    getNavCounts(),
    getSiteSettings(),
    isAiReady(),
    readNavigation(),
    readSettingForAdmin<{ sections?: unknown[] }>("home"),
    db.select({ total: count() }).from(schema.users),
  ]);
  await connection(); // "today" depends on the request time, not on the prerender.
  const now = new Date();
  const today = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: TIME_ZONE }).format(now);

  const unpublishedChanges = pages.filter((p) => p.status === "published" && p.hasChanges).length;
  const change = overview.previous ? Math.round(((overview.views - overview.previous) / overview.previous) * 100) : null;
  const votes = overview.helpful + overview.unhelpful;
  const categories = navigation.tabs.reduce((n, tab) => n + tab.sections.length, 0);
  const brokenLinks = await countBrokenLinks();

  const attention: { icon: LucideIcon; text: string; href: string; tone: "accent" | "plain" }[] = [
    counts.comments && { icon: MessageSquare, text: `${counts.comments} komentar menunggu persetujuan`, href: "/admin/comments?view=pending", tone: "accent" as const },
    counts.feedback && { icon: MessageSquareText, text: `${counts.feedback} pesan pembaca belum ditangani`, href: "/admin/stats", tone: "accent" as const },
    unpublishedChanges && { icon: FilePen, text: `${unpublishedChanges} halaman terbit punya perubahan yang belum diterbitkan`, href: "/admin/pages?status=published", tone: "plain" as const },
    counts.review && { icon: CalendarCheck, text: `${counts.review} halaman sudah waktunya ditinjau ulang`, href: "/admin/review", tone: "plain" as const },
    brokenLinks && { icon: Link2Off, text: `${brokenLinks} tautan rusak di halaman yang terbit`, href: "/admin/review?tab=tautan", tone: "plain" as const },
    asks.missed && { icon: Sparkles, text: `${asks.missed} pertanyaan Tanya AI tidak terjawab dokumentasi (7 hari)`, href: "/admin/stats?range=7", tone: "plain" as const },
    searches.missed && { icon: SearchX, text: `${searches.missed} pencarian tanpa hasil (7 hari)`, href: "/admin/stats?range=7", tone: "plain" as const },
  ].filter((item): item is Exclude<typeof item, 0 | false> => Boolean(item));

  const steps: SetupStep[] = [
    { label: "Hubungkan AI", hint: "Isi API key di Pengaturan → AI.", href: "/admin/settings#ai", done: aiReady },
    { label: "Susun kategori", hint: "Kelompokkan halaman di menu Halaman.", href: "/admin/pages", done: categories > 0 },
    { label: "Terbitkan halaman pertama", hint: "Tulis lalu klik Terbitkan.", href: "/admin/pages", done: stats.published > 0 },
    { label: "Susun beranda", hint: "Atur bagian beranda lalu terbitkan.", href: "/admin/home", done: Array.isArray(home?.sections) },
    { label: "Tambah anggota tim", hint: "Undang editor atau admin lain.", href: "/admin/users", done: users[0].total > 1 },
    { label: "Aktifkan verifikasi dua langkah", hint: "Lindungi akun admin dengan kode dari ponsel.", href: "/admin/profile#2fa", done: admin ? (await twoFactorStatus(user.id)).enabled : true },
  ];

  return (
    <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-fg-subtle first-letter:uppercase">{today}</p>
          <h1 className="mt-1 font-serif text-3xl font-light tracking-tight text-fg">
            {greeting(now)}, {user.name.split(" ")[0]}
          </h1>
          <p className="mt-1.5 text-sm text-fg-muted">Ringkasan {site.name} dalam 7 hari terakhir.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/ai" className={buttonClass("secondary")}>
            <Sparkles className="size-4" />
            AI Chat
          </Link>
          <NewPageButton className={buttonClass("accent")}>
            <Plus className="size-4" />
            Halaman baru
          </NewPageButton>
        </div>
      </div>

      {admin && <SetupChecklist steps={steps} />}

      <section aria-label="Perlu perhatian" className="mb-6">
        {attention.length === 0 ? (
          <p className="flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-fg-muted">
            <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
            Semua beres. Tidak ada komentar, pesan, atau perubahan yang menunggu.
          </p>
        ) : (
          <Panel>
            <h2 className="border-b border-line px-5 py-3 text-sm font-medium text-fg">Perlu perhatian</h2>
            <ul className="divide-y divide-line">
              {attention.map((item) => (
                <li key={item.text}>
                  <Link href={item.href} className="group flex items-center gap-3 px-5 py-3 hover:bg-fill/40">
                    <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${item.tone === "accent" ? "bg-accent text-white" : "bg-fill text-fg-muted"}`}>
                      <item.icon className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1 text-sm text-fg">{item.text}</span>
                    <ChevronRight className="size-4 text-fg-subtle group-hover:text-fg" />
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={Eye}
          label="Kunjungan"
          value={number.format(overview.views)}
          href="/admin/stats?range=7"
          note={
            change === null ? (
              "Belum ada pembanding"
            ) : (
              <span className={`inline-flex items-center gap-0.5 ${change >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                {change >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
                {Math.abs(change)}% dari minggu lalu
              </span>
            )
          }
        >
          <Sparkline values={overview.daily.map((d) => d.views)} />
        </StatCard>
        <StatCard
          icon={ThumbsUp}
          label="Membantu"
          value={votes ? `${Math.round((overview.helpful / votes) * 100)}%` : "—"}
          note={votes ? `${overview.helpful} ya · ${overview.unhelpful} tidak` : "Belum ada penilaian"}
          href="/admin/stats?range=7"
        />
        <StatCard
          icon={Globe}
          label="Halaman terbit"
          value={number.format(stats.published)}
          note={`${stats.draft} draf · ${stats.scheduled} terjadwal`}
          href="/admin/pages?status=published"
        />
        <StatCard
          icon={Search}
          label="Pencarian"
          value={number.format(searches.searches)}
          note={asks.asks ? `${asks.asks} pertanyaan Tanya AI` : `${searches.missed} tanpa hasil`}
          href="/admin/stats?range=7"
        />
      </div>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Panel>
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 className="text-sm font-medium text-fg">Terakhir diubah</h2>
            <Link href="/admin/pages" className="text-xs text-fg-muted hover:text-fg">
              Lihat semua
            </Link>
          </div>
          <ul className="divide-y divide-line">
            {pages.length === 0 && <li className="px-5 py-8 text-center text-sm text-fg-subtle">Belum ada halaman. Mulai dengan “Halaman baru”.</li>}
            {pages.slice(0, 7).map((page) => (
              <li key={page.id}>
                <Link href={`/admin/pages/${page.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-fill/40">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-fg">{page.title || "Tanpa judul"}</span>
                    <span className="block truncate text-xs text-fg-subtle">
                      {formatDateTime(page.updatedAt)}
                      {page.updatedBy && ` · ${page.updatedBy}`}
                    </span>
                  </span>
                  {page.hasChanges && page.status === "published" && (
                    <span className="hidden text-[11px] text-amber-600 sm:inline dark:text-amber-400" title="Ada perubahan yang belum diterbitkan">
                      • ada perubahan
                    </span>
                  )}
                  <StatusBadge status={page.status} />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        <div className="space-y-6">
          <Panel>
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <h2 className="flex items-center gap-1.5 text-sm font-medium text-fg">
                <TrendingUp className="size-4 text-accent" />
                Populer minggu ini
              </h2>
              <Link href="/admin/stats?range=7" className="text-xs text-fg-muted hover:text-fg">
                Statistik
              </Link>
            </div>
            {top.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-fg-subtle">Belum ada kunjungan minggu ini.</p>
            ) : (
              <ol className="space-y-3 px-5 py-4">
                {top.map((page) => (
                  <li key={page.id}>
                    <Link href={`/docs/${page.slug}`} target="_blank" className="group block">
                      <span className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="truncate text-fg group-hover:text-accent">{page.title || page.slug}</span>
                        <span className="shrink-0 text-xs text-fg-subtle tabular-nums">{number.format(page.views)}</span>
                      </span>
                      <span className="mt-1 block h-1 overflow-hidden rounded-full bg-fill">
                        <span className="block h-full rounded-full bg-accent/70" style={{ width: `${Math.max(4, (page.views / Math.max(1, top[0].views)) * 100)}%` }} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <Panel>
            <div className="border-b border-line px-5 py-3">
              <h2 className="flex items-center gap-1.5 text-sm font-medium text-fg">
                <CalendarClock className="size-4 text-sky-600 dark:text-sky-400" />
                Jadwal terbit
              </h2>
            </div>
            <ul className="divide-y divide-line">
              {scheduled.length === 0 && <li className="px-5 py-6 text-center text-sm text-fg-subtle">Tidak ada jadwal. Pilih “Jadwalkan” saat menerbitkan.</li>}
              {scheduled.map((page) => (
                <li key={page.id}>
                  <Link href={`/admin/pages/${page.id}`} className="block px-5 py-3 hover:bg-fill/40">
                    <span className="block truncate text-sm text-fg">{page.title || "Tanpa judul"}</span>
                    <span className="block text-xs text-sky-700 dark:text-sky-300">{formatDateTime(page.publishedAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}
