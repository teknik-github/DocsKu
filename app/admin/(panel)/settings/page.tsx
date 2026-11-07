import { Suspense } from "react";
import Link from "next/link";
import { ChevronRight, KeyRound, Server } from "lucide-react";
import { requireAdmin } from "@/lib/auth/dal";
import { readSettingForAdmin } from "@/lib/data/admin";
import { DEFAULT_SITE, getAskAiSettings, getCommentSettings } from "@/lib/data/site";
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
import { PageHeader, Panel } from "@/components/admin/ui";

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

async function Settings() {
  await requireAdmin();
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
    { id: "integrasi", label: "Integrasi", status: { text: "MCP", tone: "plain" } },
  ];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[12.5rem_minmax(0,1fr)] lg:gap-10">
      <SettingsNav sections={sections} />
      <div className="min-w-0 space-y-12 pb-24 lg:pb-[45vh]">
        <Section id="umum" title="Umum" description="Nama situs, tombol di header, menu Sumber daya, dan kolom footer.">
          <SiteSettingsForm initial={site} />
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
