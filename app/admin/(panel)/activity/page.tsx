import { Fragment, Suspense } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { requireAdmin } from "@/lib/auth/dal";
import { ACTIVITY_KINDS, ACTIVITY_PER_PAGE, ACTIVITY_RETENTION_DAYS, listActivity, listActivityPeople, pageLabel, type ActivityKind, type ActivityRow } from "@/lib/activity";
import { activityHref, activityText } from "@/lib/activity-text";
import { PageHeader, Panel, buttonClass, inputClass } from "@/components/admin/ui";

export const metadata = { title: "Aktivitas" };

const TIME_ZONE = process.env.NEXT_PUBLIC_TIME_ZONE || "Asia/Jakarta";
const RANGES = [
  { value: "1", label: "24 jam terakhir" },
  { value: "7", label: "7 hari" },
  { value: "30", label: "30 hari" },
  { value: "90", label: "90 hari" },
];
const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const dayLabel = new Intl.DateTimeFormat("id-ID", { timeZone: TIME_ZONE, weekday: "long", day: "numeric", month: "long", year: "numeric" });
const timeLabel = new Intl.DateTimeFormat("id-ID", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" });

export default function ActivityPage({ searchParams }: PageProps<"/admin/activity">) {
  return (
    <>
      <PageHeader
        title="Aktivitas"
        description={`Siapa melakukan apa di dasbor dan lewat MCP. Catatan disimpan ${ACTIVITY_RETENTION_DAYS} hari.`}
      />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-fill" />}>
        <Activity searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Activity({ searchParams }: Pick<PageProps<"/admin/activity">, "searchParams">) {
  await requireAdmin();
  const params = await searchParams;
  const person = params.orang === "sistem" || isId(params.orang) ? (params.orang as string) : undefined;
  const kind = typeof params.jenis === "string" && params.jenis in ACTIVITY_KINDS ? (params.jenis as ActivityKind) : undefined;
  const days = RANGES.some((r) => r.value === params.hari) ? Number(params.hari) : undefined;
  const pageId = isId(params.halaman) ? params.halaman : undefined;
  const page = Math.max(1, Math.floor(Number(params.p) || 1));

  const [{ rows, total }, people, pageTitle] = await Promise.all([
    listActivity({ userId: person, kind, days, target: pageId ? { type: "page", id: pageId } : undefined, page }),
    listActivityPeople(),
    pageId ? pageLabel(pageId) : null,
  ]);
  const lastPage = Math.max(1, Math.ceil(total / ACTIVITY_PER_PAGE));
  const filtered = Boolean(person || kind || days || pageId);

  const href = (p: number, keepPage = true) => {
    const qs = new URLSearchParams();
    if (person) qs.set("orang", person);
    if (kind) qs.set("jenis", kind);
    if (days) qs.set("hari", String(days));
    if (pageId && keepPage) qs.set("halaman", pageId);
    if (p > 1) qs.set("p", String(p));
    const s = qs.toString();
    return `/admin/activity${s ? `?${s}` : ""}`;
  };

  // Newest first, grouped by Jakarta day.
  const days_: { key: string; label: string; items: ActivityRow[] }[] = [];
  for (const row of rows) {
    const date = new Date(row.createdAt);
    const key = dayKey.format(date);
    const last = days_[days_.length - 1];
    if (last?.key === key) last.items.push(row);
    else days_.push({ key, label: dayLabel.format(date), items: [row] });
  }

  return (
    <div className="space-y-4">
      <form className="flex flex-wrap items-center gap-2" role="search">
        {pageId && <input type="hidden" name="halaman" value={pageId} />}
        <select name="orang" defaultValue={person ?? ""} aria-label="Orang" className={`${inputClass} h-8 w-auto max-w-56 pr-8 text-xs`}>
          <option value="">Semua orang</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value="sistem">Sistem & percobaan masuk</option>
        </select>
        <select name="jenis" defaultValue={kind ?? ""} aria-label="Jenis aktivitas" className={`${inputClass} h-8 w-auto max-w-64 pr-8 text-xs`}>
          <option value="">Semua jenis</option>
          {(Object.keys(ACTIVITY_KINDS) as ActivityKind[]).map((k) => (
            <option key={k} value={k}>
              {ACTIVITY_KINDS[k].label}
            </option>
          ))}
        </select>
        <select name="hari" defaultValue={days ? String(days) : ""} aria-label="Rentang waktu" className={`${inputClass} h-8 w-auto pr-8 text-xs`}>
          <option value="">Kapan saja</option>
          {RANGES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <button type="submit" className={buttonClass("secondary", "sm")}>
          Saring
        </button>
        {filtered && (
          <Link href="/admin/activity" className="text-xs text-fg-muted hover:text-fg">
            Hapus saringan
          </Link>
        )}
        <span className="ml-auto text-xs text-fg-subtle tabular-nums">{total} entri</span>
      </form>

      {pageId && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
          Riwayat halaman
          <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent">
            {pageTitle ?? "yang sudah dihapus"}
            <Link href={href(1, false)} aria-label="Tampilkan semua halaman" className="-mr-1 rounded-full p-0.5 hover:bg-accent/15">
              <X className="size-3" />
            </Link>
          </span>
          {pageTitle && (
            <Link href={`/admin/pages/${pageId}`} className="text-xs text-accent hover:underline">
              Buka di editor
            </Link>
          )}
        </p>
      )}

      {rows.length === 0 ? (
        <Panel className="px-5 py-16 text-center text-sm text-fg-subtle">{filtered ? "Tidak ada aktivitas yang cocok dengan saringan." : "Belum ada aktivitas tercatat."}</Panel>
      ) : (
        <Panel className="overflow-hidden">
          {days_.map((day) => (
            <Fragment key={day.key}>
              <h2 className="sticky top-0 z-[1] border-b border-line bg-fill/80 px-5 py-2 text-xs font-medium text-fg-muted backdrop-blur first:rounded-t-xl">{day.label}</h2>
              <ul className="divide-y divide-line border-b border-line last:border-b-0">
                {day.items.map((row) => (
                  <Entry key={row.id} row={row} />
                ))}
              </ul>
            </Fragment>
          ))}
        </Panel>
      )}

      {lastPage > 1 && (
        <nav aria-label="Halaman daftar" className="flex items-center justify-end gap-2 text-sm">
          <span className="text-xs text-fg-subtle tabular-nums">
            Halaman {Math.min(page, lastPage)} dari {lastPage}
          </span>
          <Link href={href(page - 1)} aria-disabled={page <= 1} aria-label="Sebelumnya" className={`${buttonClass("secondary", "sm")} ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}>
            <ChevronLeft className="size-3.5" />
          </Link>
          <Link href={href(page + 1)} aria-disabled={page >= lastPage} aria-label="Berikutnya" className={`${buttonClass("secondary", "sm")} ${page >= lastPage ? "pointer-events-none opacity-40" : ""}`}>
            <ChevronRight className="size-3.5" />
          </Link>
        </nav>
      )}
    </div>
  );
}

const DOT = { danger: "bg-red-500", warn: "bg-amber-500", good: "bg-emerald-500" };

function Entry({ row }: { row: ActivityRow }) {
  const text = activityText(row.action, row.meta);
  const link = row.targetExists ? activityHref(row.targetType, row.targetId) : null;
  const label = row.targetLabel || (row.targetType === "page" ? "Tanpa judul" : null);
  const via = row.meta.via === "mcp" ? "lewat MCP" : null;
  const ip = typeof row.meta.ip === "string" ? row.meta.ip : null;
  const email = row.action === "auth.login_failed" && typeof row.meta.email === "string" ? row.meta.email : null;

  const target =
    !text.noTarget && label ? (
      link ? (
        <Link href={link} className="font-medium text-fg hover:text-accent hover:underline">
          {label}
        </Link>
      ) : (
        <span className="font-medium text-fg" title={row.targetType === "page" || row.targetType === "user" || row.targetType === "media" ? "Sudah dihapus" : undefined}>
          {label}
        </span>
      )
    ) : null;

  return (
    <li className="flex items-start gap-3 px-5 py-2.5 text-sm" data-action={row.action}>
      <time dateTime={row.createdAt} className="w-11 shrink-0 pt-px text-xs text-fg-subtle tabular-nums">
        {timeLabel.format(new Date(row.createdAt))}
      </time>
      <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${text.tone ? DOT[text.tone] : "bg-fg-subtle/40"}`} aria-hidden />
      <p className="min-w-0 flex-1 text-fg-muted">
        {text.subject ? (
          <>{text.subject} </>
        ) : (
          <>
            <span className="font-medium text-fg">{row.actorName}</span> {text.verb}{" "}
          </>
        )}
        {target}
        {text.after}
        {(via || email || ip) && (
          <span className="ml-1.5 text-xs text-fg-subtle">
            {[via, email && `(${email})`, ip && `IP ${ip}`].filter(Boolean).join(" · ")}
          </span>
        )}
        {row.targetType === "page" && row.targetId && row.targetExists && (
          <Link href={`/admin/activity?halaman=${row.targetId}`} className="ml-1.5 text-xs text-fg-subtle hover:text-accent">
            Riwayat
          </Link>
        )}
      </p>
    </li>
  );
}
