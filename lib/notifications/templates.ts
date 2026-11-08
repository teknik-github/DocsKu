import "server-only";
import type { NotifyEvent } from "@/lib/notify";

/** Plain text and a small, inline-styled HTML version of one notification email. */
export type EmailContent = { subject: string; text: string; html: string };

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function renderEmail({
  siteName,
  subject,
  heading,
  lines,
  quote,
  action,
  list,
}: {
  siteName: string;
  subject: string;
  heading: string;
  lines: string[];
  quote?: string | null;
  action?: { label: string; url: string } | null;
  list?: { title: string; items: { text: string; url?: string; meta?: string }[] }[];
}): EmailContent {
  const footer = `Email ini dikirim oleh ${siteName}. Atur notifikasi di Profil → Notifikasi email.`;
  const text = [
    heading,
    "",
    ...lines,
    ...(quote ? ["", ...quote.split("\n").map((l) => `> ${l}`)] : []),
    ...(list ?? []).flatMap((group) => ["", group.title, ...group.items.map((i) => `- ${i.text}${i.meta ? ` (${i.meta})` : ""}${i.url ? `\n  ${i.url}` : ""}`)]),
    ...(action ? ["", `${action.label}: ${action.url}`] : []),
    "",
    "—",
    footer,
  ].join("\n");

  const p = (s: string) => `<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#334155">${escapeHtml(s)}</p>`;
  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:24px">
<p style="margin:0 0 16px;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#64748b">${escapeHtml(siteName)}</p>
<h1 style="margin:0 0 16px;font-size:18px;line-height:1.4;color:#0f172a">${escapeHtml(heading)}</h1>
${lines.map(p).join("\n")}
${quote ? `<blockquote style="margin:0 0 16px;padding:10px 14px;border-left:3px solid #cbd5e1;background:#f8fafc;color:#334155;font-size:14px;line-height:1.6;white-space:pre-wrap">${escapeHtml(quote)}</blockquote>` : ""}
${(list ?? [])
  .map(
    (group) =>
      `<p style="margin:16px 0 6px;font-size:13px;font-weight:600;color:#0f172a">${escapeHtml(group.title)}</p><ul style="margin:0 0 12px;padding-left:18px;font-size:14px;line-height:1.6;color:#334155">${group.items
        .map(
          (i) =>
            `<li>${i.url ? `<a href="${escapeHtml(i.url)}" style="color:#2563eb">${escapeHtml(i.text)}</a>` : escapeHtml(i.text)}${i.meta ? ` <span style="color:#64748b">(${escapeHtml(i.meta)})</span>` : ""}</li>`,
        )
        .join("")}</ul>`,
  )
  .join("\n")}
${action ? `<p style="margin:20px 0 4px"><a href="${escapeHtml(action.url)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:9px 16px;border-radius:8px;font-size:14px;font-weight:600">${escapeHtml(action.label)}</a></p>` : ""}
<p style="margin:24px 0 0;font-size:12px;color:#94a3b8">${escapeHtml(footer)}</p>
</div></body></html>`;
  return { subject, text, html };
}

const quoteTitle = (t: string) => `“${t}”`;

/** The email for one event, or null when the event has no email form (search.misses). */
export function eventEmail(event: NotifyEvent, siteName: string, origin: string): EmailContent | null {
  const abs = (path: string) => (/^https?:\/\//.test(path) ? path : `${origin}${path}`);
  const prefix = `[${siteName}]`;
  switch (event.type) {
    case "comment.new":
      return renderEmail({
        siteName,
        subject: `${prefix} Komentar baru${event.pending ? " menunggu persetujuan" : ""} di ${quoteTitle(event.pageTitle)}`,
        heading: event.pending ? "Komentar baru menunggu persetujuan" : "Ada komentar baru",
        lines: [`${event.author} berkomentar di ${quoteTitle(event.pageTitle)}.`],
        quote: event.excerpt,
        action: { label: event.pending ? "Tinjau komentar" : "Balas komentar", url: abs(event.pending ? "/admin/comments?view=pending" : "/admin/comments?view=unanswered") },
      });
    case "feedback.new":
      return renderEmail({
        siteName,
        subject: `${prefix} Pesan pembaca untuk ${quoteTitle(event.pageTitle)}`,
        heading: "Pesan baru dari pembaca",
        lines: [`Pembaca menilai ${quoteTitle(event.pageTitle)} ${event.helpful ? "membantu 👍" : "kurang membantu 👎"} dan menulis:`],
        quote: event.message,
        action: { label: "Lihat di Statistik", url: abs("/admin/stats") },
      });
    case "page.submitted":
      return renderEmail({
        siteName,
        subject: `${prefix} ${event.by} mengajukan ${quoteTitle(event.title)} untuk ditinjau`,
        heading: "Ada draf yang menunggu persetujuan",
        lines: [`${event.by} mengajukan ${quoteTitle(event.title)}.`],
        quote: event.note || null,
        action: { label: "Tinjau draf", url: abs(`/admin/pages/${event.pageId}`) },
      });
    case "page.approved":
      return renderEmail({
        siteName,
        subject: `${prefix} ${quoteTitle(event.title)} disetujui dan terbit`,
        heading: "Pengajuan Anda disetujui",
        lines: [`${event.by} menyetujui ${quoteTitle(event.title)}, dan halamannya sudah terbit.`],
        action: { label: "Lihat halaman", url: abs(event.href) },
      });
    case "page.changes_requested":
      return renderEmail({
        siteName,
        subject: `${prefix} ${quoteTitle(event.title)} perlu diperbaiki`,
        heading: "Pengajuan Anda perlu diperbaiki",
        lines: [`${event.by} meminta perubahan pada ${quoteTitle(event.title)}:`],
        quote: event.note,
        action: { label: "Buka editor", url: abs(`/admin/pages/${event.pageId}`) },
      });
    case "page.published":
      return renderEmail({
        siteName,
        subject: `${prefix} Terbit: ${quoteTitle(event.title)}`,
        heading: "Halaman baru terbit",
        lines: [`${event.by} menerbitkan ${quoteTitle(event.title)}.`],
        action: { label: "Lihat halaman", url: abs(event.href) },
      });
    case "search.misses":
      return null;
  }
}

/* ------------------------------------------------------------ webhooks -- */

/** One line describing the event, used by every chat format. */
export function eventSummary(event: NotifyEvent): { title: string; text: string; url: string | null } {
  switch (event.type) {
    case "page.published":
      return { title: `Terbit: ${event.title}`, text: `${event.by} menerbitkan halaman ini.`, url: event.href };
    case "page.submitted":
      return { title: `Diajukan: ${event.title}`, text: `${event.by} mengajukan draf untuk ditinjau.${event.note ? `\n${event.note}` : ""}`, url: `/admin/pages/${event.pageId}` };
    case "page.approved":
      return { title: `Disetujui: ${event.title}`, text: `${event.by} menyetujui dan menerbitkan halaman ini.`, url: event.href };
    case "page.changes_requested":
      return { title: `Perlu diperbaiki: ${event.title}`, text: `${event.by}: ${event.note}`, url: `/admin/pages/${event.pageId}` };
    case "comment.new":
      return {
        title: `Komentar baru${event.pending ? " (menunggu)" : ""}: ${event.pageTitle}`,
        text: `${event.author}: ${event.excerpt}`,
        url: event.pending ? "/admin/comments?view=pending" : event.href,
      };
    case "feedback.new":
      return { title: `Pesan pembaca ${event.helpful ? "👍" : "👎"}: ${event.pageTitle}`, text: event.message, url: "/admin/stats" };
    case "search.misses":
      return {
        title: `Pencarian tanpa hasil (${event.day})`,
        text: event.queries.map((q) => `• ${q.query} — ${q.misses}×`).join("\n"),
        url: "/admin/stats",
      };
  }
}
