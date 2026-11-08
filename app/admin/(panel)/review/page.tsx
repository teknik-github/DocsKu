import { Suspense } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ExternalLink, FileText, Globe, Link2Off } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { getReviewSettings, isRefusal, listReviewPages, scanLinks, type LinkProblem } from "@/lib/review";
import { formatDateTime } from "@/components/admin/format";
import { PageHeader, Panel } from "@/components/admin/ui";
import { CheckExternalButton, MarkReviewedButton } from "@/components/admin/review-actions";

export const metadata = { title: "Tinjauan" };

const PROBLEM: Record<LinkProblem["kind"], string> = {
  page: "Halaman tidak ada",
  draft: "Halaman belum terbit",
  internal: "Alamat tidak valid",
  redirect: "Lewat redirect",
  anchor: "Judul bagian (#) tidak ada",
  media: "Berkas media hilang",
  private: "Halaman internal (pembaca umum tidak bisa membuka)",
};

export default function ReviewPage({ searchParams }: PageProps<"/admin/review">) {
  return (
    <>
      <PageHeader title="Tinjauan" description="Halaman yang sudah waktunya dicek ulang, dan tautan rusak di halaman yang terbit." />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-fill" />}>
        <Review searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Review({ searchParams }: Pick<PageProps<"/admin/review">, "searchParams">) {
  const user = await requireUser();
  const params = await searchParams;
  const tab = params.tab === "tautan" ? "tautan" : "jadwal";
  const mine = params.milik === "saya";

  const [settings, rows, links] = await Promise.all([getReviewSettings(), listReviewPages({ userId: user.id, mine }), scanLinks()]);
  const overdue = rows.filter((r) => r.days < 0);
  const soon = rows.filter((r) => r.days >= 0);
  const broken = links.problems.filter((p) => p.kind !== "redirect");
  const externalBroken = links.external.filter((e) => e.ok === false && !isRefusal(e.status));

  const href = (next: { tab?: string; mine?: boolean }) => {
    const qs = new URLSearchParams();
    const t = next.tab ?? tab;
    if (t !== "jadwal") qs.set("tab", t);
    if (next.mine ?? mine) qs.set("milik", "saya");
    const s = qs.toString();
    return `/admin/review${s ? `?${s}` : ""}`;
  };
  const tabs = [
    { id: "jadwal", label: "Jadwal tinjauan", count: overdue.length },
    { id: "tautan", label: "Tautan rusak", count: broken.length + externalBroken.length },
  ];

  return (
    <div className="space-y-6">
      <nav aria-label="Bagian tinjauan" className="flex gap-1 border-b border-line">
        {tabs.map((t) => (
          <Link
            key={t.id}
            href={href({ tab: t.id })}
            aria-current={t.id === tab ? "page" : undefined}
            className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm ${
              t.id === tab ? "border-accent font-medium text-fg" : "border-transparent text-fg-muted hover:text-fg"
            }`}
          >
            {t.label}
            {t.count > 0 && <span className="rounded-full bg-fill px-1.5 text-[11px] text-fg-muted tabular-nums">{t.count}</span>}
          </Link>
        ))}
      </nav>

      {tab === "jadwal" ? (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-fg-muted">Tampilkan:</span>
            <Link href={href({ mine: false })} aria-current={!mine ? "true" : undefined} className={!mine ? "font-medium text-fg" : "text-accent hover:underline"}>
              Semua halaman
            </Link>
            <span className="text-line-strong">|</span>
            <Link href={href({ mine: true })} aria-current={mine ? "true" : undefined} className={mine ? "font-medium text-fg" : "text-accent hover:underline"}>
              Milik saya
            </Link>
            <span className="ml-auto text-xs text-fg-subtle">
              {settings.enabled ? (settings.defaultIntervalDays ? `Jadwal bawaan: setiap ${settings.defaultIntervalDays} hari.` : "Hanya halaman dengan jadwal sendiri.") : "Tinjauan berkala dimatikan."}
              {user.role === "admin" && (
                <>
                  {" "}
                  <Link href="/admin/settings#tinjauan" className="underline hover:text-fg">
                    Ubah
                  </Link>
                </>
              )}
            </span>
          </div>

          {!settings.enabled ? (
            <Empty icon={CheckCircle2} text="Tinjauan berkala sedang dimatikan, jadi tidak ada halaman yang jatuh tempo." />
          ) : rows.length === 0 ? (
            <Empty icon={CheckCircle2} text={mine ? "Tidak ada halaman milik Anda yang perlu ditinjau dalam 14 hari ke depan." : "Semua halaman masih segar. Tidak ada yang jatuh tempo dalam 14 hari ke depan."} />
          ) : (
            <>
              <ReviewTable title="Perlu ditinjau" hint="Sudah lewat jadwal tinjauannya." rows={overdue} />
              <ReviewTable title="Segera" hint="Jatuh tempo dalam 14 hari." rows={soon} />
            </>
          )}
        </>
      ) : (
        <>
          <p className="text-sm text-fg-muted">
            Diperiksa dari isi {links.scanned} halaman yang terbit: tautan ke halaman dokumentasi, tautan ke judul bagian (#), dan gambar dari Media. Perbaiki di editor, lalu terbitkan ulang.
          </p>

          <Panel>
            <h2 className="flex items-center gap-2 border-b border-line px-5 py-3 text-sm font-medium">
              <Link2Off className="size-4 text-fg-muted" />
              Tautan di dalam situs
              <span className="text-fg-subtle tabular-nums">({broken.length})</span>
            </h2>
            {links.problems.length === 0 ? (
              <p className="flex items-center gap-2 px-5 py-4 text-sm text-fg-muted">
                <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                Tidak ada tautan rusak.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {links.problems.map((p, i) => (
                  <li key={`${p.pageId}-${p.href}-${i}`} className="grid gap-x-4 gap-y-1 px-5 py-3 text-sm md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_11rem]">
                    <span className="min-w-0">
                      <code className="block truncate font-mono text-xs text-fg" title={p.href}>
                        {p.href}
                      </code>
                      {p.label && <span className="block truncate text-xs text-fg-subtle">&ldquo;{p.label}&rdquo;</span>}
                    </span>
                    <Link href={`/admin/pages/${p.pageId}`} className="flex min-w-0 items-center gap-1.5 text-fg-muted hover:text-accent">
                      <FileText className="size-3.5 shrink-0" />
                      <span className="truncate">{p.pageTitle || "Tanpa judul"}</span>
                    </Link>
                    <span className={`text-xs md:text-right ${p.kind === "redirect" ? "text-fg-subtle" : "font-medium text-red-600 dark:text-red-400"}`}>{PROBLEM[p.kind]}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <ExternalPanel external={links.external} />
        </>
      )}
    </div>
  );
}

function Empty({ icon: Icon, text }: { icon: typeof CheckCircle2; text: string }) {
  return (
    <p className="flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-fg-muted">
      <Icon className="size-4 text-emerald-600 dark:text-emerald-400" />
      {text}
    </p>
  );
}

function ReviewTable({ title, hint, rows }: { title: string; hint: string; rows: Awaited<ReturnType<typeof listReviewPages>> }) {
  if (!rows.length) return null;
  return (
    <Panel>
      <div className="flex items-baseline gap-2 border-b border-line px-5 py-3">
        <h2 className="text-sm font-medium text-fg">{title}</h2>
        <span className="text-xs text-fg-subtle tabular-nums">{rows.length}</span>
        <span className="ml-auto hidden text-xs text-fg-subtle sm:inline">{hint}</span>
      </div>
      <ul className="divide-y divide-line">
        {rows.map((row) => (
          <li key={row.id} className="grid items-center gap-x-4 gap-y-1 px-5 py-3 text-sm md:grid-cols-[minmax(0,1fr)_9rem_8.5rem_7rem_auto] xl:grid-cols-[minmax(0,1fr)_11rem_10rem_8rem_auto]">
            <span className="min-w-0">
              <Link href={`/admin/pages/${row.id}`} className="line-clamp-2 font-medium text-fg hover:text-accent">
                {row.title || "Tanpa judul"}
              </Link>
              <span className="block truncate font-mono text-xs text-fg-subtle">
                /docs/{row.slug}
                {row.visibility === "internal" && <span className="ml-2 rounded bg-fill px-1 font-sans text-[10px] text-fg-muted">Internal</span>}
              </span>
            </span>
            <span className="truncate text-xs text-fg-muted" title="Penanggung jawab">
              <span className="md:hidden">Penanggung jawab: </span>
              {row.ownerName ?? "—"}
              {row.ownerIsAuthor && <span className="text-fg-subtle"> (penulis)</span>}
            </span>
            <span className="text-xs text-fg-subtle" title="Terakhir ditinjau">
              <span className="md:hidden">Terakhir ditinjau </span>
              {formatDateTime(row.reviewedAt ?? row.publishedAt)}
            </span>
            <span className={`text-xs ${row.days < 0 ? "font-medium text-amber-700 dark:text-amber-300" : "text-fg-muted"}`}>
              {row.days < 0 ? (
                <span className="inline-flex items-center gap-1">
                  <AlertTriangle className="size-3" />
                  Lewat {-row.days} hari
                </span>
              ) : row.days === 0 ? (
                "Hari ini"
              ) : (
                `${row.days} hari lagi`
              )}
            </span>
            <span className="flex items-center gap-1 md:justify-end">
              {row.visibility !== "internal" && (
                <a href={`/docs/${row.slug}`} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-fg-muted hover:bg-fill hover:text-fg">
                  Lihat <ExternalLink className="size-3" />
                </a>
              )}
              <Link href={`/admin/pages/${row.id}`} className="inline-flex h-7 items-center rounded-md px-2 text-xs text-fg-muted hover:bg-fill hover:text-fg">
                Buka editor
              </Link>
              <MarkReviewedButton pageId={row.id} title={row.title} />
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function ExternalPanel({ external }: { external: Awaited<ReturnType<typeof scanLinks>>["external"] }) {
  const broken = external.filter((e) => e.ok === false && !isRefusal(e.status));
  const refused = external.filter((e) => e.ok === false && isRefusal(e.status));
  const unchecked = external.filter((e) => e.ok === null).length;
  const fine = external.filter((e) => e.ok).length;
  const last = external.reduce<string | null>((max, e) => (e.checkedAt && (!max || e.checkedAt > max) ? e.checkedAt : max), null);
  const shown = [...broken, ...refused];

  return (
    <Panel>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-5 py-3">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <Globe className="size-4 text-fg-muted" />
          Tautan luar
          <span className="text-fg-subtle tabular-nums">({external.length})</span>
        </h2>
        <span className="text-xs text-fg-subtle">
          {fine} baik · {broken.length} rusak{refused.length ? ` · ${refused.length} menolak pemeriksa` : ""}
          {unchecked ? ` · ${unchecked} belum diperiksa` : ""}
          {last && ` · terakhir ${formatDateTime(last)}`}
        </span>
        <span className="ml-auto">{external.length > 0 && <CheckExternalButton total={external.length} />}</span>
      </div>
      {external.length === 0 ? (
        <p className="px-5 py-4 text-sm text-fg-muted">Belum ada tautan ke situs luar di halaman yang terbit.</p>
      ) : shown.length === 0 ? (
        <p className="flex items-center gap-2 px-5 py-4 text-sm text-fg-muted">
          <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
          {unchecked === external.length ? "Belum diperiksa. Klik “Periksa tautan luar” untuk mengecek apakah alamatnya masih bisa dibuka." : "Tidak ada tautan luar yang rusak dari pemeriksaan terakhir."}
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {shown.map((e) => (
            <li key={e.url} className="grid gap-x-4 gap-y-1 px-5 py-3 text-sm md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_11rem]">
              <a href={e.url} target="_blank" rel="noreferrer noopener" className="min-w-0 truncate font-mono text-xs text-fg hover:text-accent" title={e.url}>
                {e.url}
              </a>
              <span className="flex min-w-0 flex-wrap gap-x-3 gap-y-0.5">
                {e.pages.map((p) => (
                  <Link key={p.id} href={`/admin/pages/${p.id}`} className="inline-flex min-w-0 items-center gap-1.5 text-fg-muted hover:text-accent">
                    <FileText className="size-3.5 shrink-0" />
                    <span className="truncate">{p.title || "Tanpa judul"}</span>
                  </Link>
                ))}
              </span>
              <span className={`text-xs md:text-right ${isRefusal(e.status) ? "text-fg-subtle" : "font-medium text-red-600 dark:text-red-400"}`} title={e.error ?? undefined}>
                {isRefusal(e.status) ? `Menolak pemeriksa (${e.status})` : e.status ? `HTTP ${e.status}` : e.error ?? "Gagal"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
