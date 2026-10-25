import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/dal";
import { readSettingForAdmin } from "@/lib/data/admin";
import { DEFAULT_SITE, getCommentSettings } from "@/lib/data/site";
import type { SiteSettings } from "@/lib/site-types";
import { SiteSettingsForm } from "@/components/admin/site-settings-form";
import { AiSettingsForm } from "@/components/admin/ai-settings-form";
import { isAiReady, readStoredAi, toView } from "@/lib/ai/config";
import { readAutomation } from "@/lib/automation";
import { AutomationForm } from "@/components/admin/automation-form";
import { CommentSettingsForm } from "@/components/admin/comment-settings-form";
import { PageHeader } from "@/components/admin/ui";

export const metadata = { title: "Pengaturan" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Pengaturan situs" description="AI, otomatisasi saat terbit, nama situs, tombol header, menu sumber daya, dan footer." />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-fill" />}>
        <Settings />
      </Suspense>
    </>
  );
}

async function Settings() {
  await requireAdmin();
  const [stored, ai, aiReady, automation] = await Promise.all([
    readSettingForAdmin<Partial<SiteSettings>>("site"),
    readStoredAi(),
    isAiReady(),
    readAutomation(),
  ]);
  return (
    <div className="space-y-10">
      <AiSettingsForm initial={toView(ai)} />
      <AutomationForm initial={automation} aiReady={aiReady} />
      <CommentSettingsForm initial={await getCommentSettings()} />
      <SiteSettingsForm initial={{ ...DEFAULT_SITE, ...stored }} />
    </div>
  );
}
