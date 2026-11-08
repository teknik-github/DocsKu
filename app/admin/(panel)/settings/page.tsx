import { Suspense } from "react";
import Link from "next/link";
import { ChevronRight, KeyRound, Server } from "lucide-react";
import { requireAdmin } from "@/lib/auth/dal";
import { readSettingForAdmin } from "@/lib/data/admin";
import { DEFAULT_SITE, getAskAiAvailable, getAskAiSettings, getCommentSettings, getWidgetSettings } from "@/lib/data/site";
import type { SiteSettings } from "@/lib/site-types";
import { SiteSettingsForm } from "@/components/admin/site-settings-form";
import { AiSettingsForm } from "@/components/admin/ai-settings-form";
import { isAiReady, readStoredAi, toView } from "@/lib/ai/config";
import { readAutomation } from "@/lib/automation";
import { AutomationForm } from "@/components/admin/automation-form";
import { CommentSettingsForm } from "@/components/admin/comment-settings-form";
import { AskAiSettingsForm } from "@/components/admin/ask-ai-settings-form";
import { SettingsNav, type SettingsSection } from "@/components/admin/settings-nav";
import { askedToday } from "@/lib/ai/ask";
import { countOverdueReviews, getReviewSettings } from "@/lib/review";
import { ReviewSettingsForm } from "@/components/admin/review-settings-form";
import { PageHeader, Panel } from "@/components/admin/ui";
import { WidgetSettingsForm } from "@/components/admin/widget-settings-form";
import { ExportPanel } from "@/components/admin/export-panel";
import { LanguageSettingsForm } from "@/components/admin/language-settings-form";
import { readLanguages } from "@/lib/translations";
import { COLOR_THEMES, colorThemeOf } from "@/lib/color-themes";
import { SecuritySettingsForm } from "@/components/admin/security-settings-form";
import { getSecuritySettings } from "@/lib/data/security";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export const metadata = { title: "Pengaturan" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Pengaturan" description="Identitas situs, AI, otomatisasi saat terbit, komentar, dan integrasi." />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-fill" />}>
        <Settings />
      </Suspense>
    </>
  );
}

/** One block of the page; its id is what the section list and links (#komentar…) point to. */
function Section({ id, title, description, children }: { id: SettingsSection["id"]; title?: string; description?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 lg:scroll-mt-6">
      {title && (
        <div className="mb-4">
          <h2 className="text-base font-semibold text-fg">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-fg-muted">{description}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Admins, and how many of them use 2FA (Keamanan). */
async function adminTwoFactor(userId: string) {
  const [row] = await db.execute<{ total: number; with2fa: number; own: boolean }>(sql`
    select count(*)::int as total, count(totp_enabled_at)::int as with2fa,
      bool_or(id = ${userId} and totp_enabled_at is not null) as own
    from users where role = 'admin'`);
  return { total: row?.total ?? 0, withTwoFactor: row?.with2fa ?? 0, ownEnabled: Boolean(row?.own) };
}

async function Settings() {
  const me = await requireAdmin();
  const [security, adminsTwoFactor] = await Promise.all([getSecuritySettings(), adminTwoFactor(me.id)]);
  const [stored, ai, aiReady, automation, askAi, asked, comments] = await Promise.all([
    readSettingForAdmin<Partial<SiteSettings>>("site"),
    readStoredAi(),
    isAiReady(),
    readAutomation(),
    getAskAiSettings(),
    askedToday(),
    getCommentSettings(),
  ]);
  const site = { ...DEFAULT_SITE, ...stored };
  const [widget, askAiAvailable] = await Promise.all([getWidgetSettings(), getAskAiAvailable()]);
  const [exportCounts] = await db.execute<{ pages: number; drafts: number; internal: number; translations: number }>(sql`
    select count(*) filter (where status = 'published' and visibility = 'public' and translation_of is null)::int as pages,
      count(*) filter (where status <> 'published')::int as drafts,
      count(*) filter (where visibility = 'internal')::int as internal,
      count(*) filter (where translation_of is not null)::int as translations
    from pages where kind = 'doc'`);
  const themeAccent = (COLOR_THEMES.find((t) => t.id === colorThemeOf(site.colorTheme)) ?? COLOR_THEMES[0]).light.accent;
  const [review, overdue] = await Promise.all([getReviewSettings(), countOverdueReviews()]);
  const [languages, translationCounts] = await Promise.all([
    readLanguages(),
    db.execute<{ locale: string; n: number }>(sql`select locale, count(*)::int as n from pages where translation_of is not null group by locale`),
  ]);
  const automationOn = (["navigation", "slug", "description", "seo", "cover"] as const).filter((key) => automation[key]).length;

  const sections: SettingsSection[] = [
    { id: "umum", label: "Umum", status: { text: site.name, tone: "plain" } },
    {
      id: "ai",
      label: "AI",
      status: aiReady ? { text: `Aktif · ${ai.model}`, tone: "on" } : ai.enabled ? { text: "Belum lengkap", tone: "warn" } : { text: "Mati", tone: "off" },
    },
    {
      id: "tanya-ai",
      label: "Tanya AI",
      status: askAi.enabled && aiReady ? { text: `${asked}/${askAi.dailyLimit} hari ini`, tone: "on" } : { text: askAi.enabled ? "Menunggu AI" : "Mati", tone: askAi.enabled ? "warn" : "off" },
    },
    { id: "otomatisasi", label: "Otomatisasi", status: { text: `${automationOn} dari 5 aktif`, tone: automationOn ? "on" : "off" } },
    {
      id: "komentar",
      label: "Komentar",
      status: comments.enabled ? { text: comments.moderation ? "Aktif · dimoderasi" : "Aktif", tone: "on" } : { text: "Mati", tone: "off" },
    },
    {
      id: "tinjauan",
      label: "Tinjauan konten",
      status: review.enabled && review.defaultIntervalDays ? { text: `Tiap ${review.defaultIntervalDays} hari`, tone: overdue ? "warn" : "on" } : { text: review.enabled ? "Per halaman" : "Mati", tone: review.enabled ? "on" : "off" },
    },
    {
      id: "bahasa",
      label: "Bahasa",
      status: languages.languages.length
        ? { text: `${languages.defaultLocale.toUpperCase()} + ${languages.languages.map((l) => l.code.toUpperCase()).join(", ")}`, tone: "on" }
        : { text: languages.defaultLabel, tone: "plain" },
    },
    {
      id: "keamanan",
      label: "Keamanan",
      status: security.requireAdmin2fa
        ? { text: "2FA wajib untuk admin", tone: "on" }
        : { text: `${adminsTwoFactor.withTwoFactor}/${adminsTwoFactor.total} admin 2FA`, tone: adminsTwoFactor.withTwoFactor < adminsTwoFactor.total ? "warn" : "on" },
    },
    {
      id: "widget",
      label: "Widget bantuan",
      status: widget.enabled
        ? widget.allowedOrigins.length
          ? { text: `Aktif · ${widget.allowedOrigins.length} situs`, tone: "on" }
          : { text: "Belum ada situs", tone: "warn" }
        : { text: "Mati", tone: "off" },
    },
    { id: "cadangan", label: "Cadangan & ekspor", status: { text: "ZIP · JSON", tone: "plain" } },
    { id: "integrasi", label: "Integrasi", status: { text: "MCP", tone: "plain" } },
  ];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[12.5rem_minmax(0,1fr)] lg:gap-10">
      <SettingsNav sections={sections} />
      <div className="min-w-0 space-y-12 pb-24 lg:pb-[45vh]">
        <Section id="umum" title="Umum" description="Nama situs, tombol di header, menu Sumber daya, dan kolom footer.">
          <SiteSettingsForm initial={site} languages={languages.languages} defaultLabel={languages.defaultLabel} />
        </Section>
        <Section id="ai">
          <AiSettingsForm initial={toView(ai)} />
        </Section>
        <Section id="tanya-ai">
          <AskAiSettingsForm initial={askAi} aiReady={aiReady} askedToday={asked} />
        </Section>
        <Section id="otomatisasi">
          <AutomationForm initial={automation} aiReady={aiReady} />
        </Section>
        <Section id="komentar">
          <CommentSettingsForm initial={comments} />
        </Section>
        <Section id="tinjauan">
          <ReviewSettingsForm initial={review} overdue={overdue} />
        </Section>
        <Section id="bahasa">
          <LanguageSettingsForm initial={languages} translations={Object.fromEntries([...translationCounts].map((row) => [row.locale, row.n]))} />
        </Section>
        <Section id="keamanan">
          <SecuritySettingsForm initial={security} admins={{ total: adminsTwoFactor.total, withTwoFactor: adminsTwoFactor.withTwoFactor }} ownEnabled={adminsTwoFactor.ownEnabled} />
        </Section>
        <Section id="widget">
          <WidgetSettingsForm initial={widget} siteUrl={process.env.SITE_URL?.replace(/\/+$/, "") || null} themeAccent={themeAccent} askAiAvailable={askAiAvailable} />
        </Section>
        <Section id="cadangan">
          <ExportPanel {...exportCounts} />
        </Section>
        <Section id="integrasi" title="Integrasi" description="Hubungkan aplikasi AI lain ke dokumentasi ini, atau beri AI Chat alat dari server luar.">
          <Panel className="max-w-3xl divide-y divide-line">
            {[
              { icon: KeyRound, title: "Token MCP", text: "Token pribadi agar Claude, Cursor, atau aplikasi AI lain bisa membaca dan menulis dokumentasi." },
              { icon: Server, title: "Server MCP luar", text: "Tambahkan tool dari server lain untuk dipakai AI Chat, dengan izin per tool." },
            ].map((item) => (
              <Link key={item.title} href="/admin/mcp" className="group flex items-center gap-3 p-5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                  <item.icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-fg group-hover:text-accent">{item.title}</span>
                  <span className="block text-xs text-fg-subtle">{item.text}</span>
                </span>
                <ChevronRight className="size-4 text-fg-subtle" />
              </Link>
            ))}
          </Panel>
        </Section>
      </div>
    </div>
  );
}
