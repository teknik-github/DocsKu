import { Suspense } from "react";
import { Plus } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { listTemplateChoices } from "@/lib/templates";
import { PageHeader, buttonClass } from "@/components/admin/ui";
import { NewPageButton } from "@/components/admin/new-page-button";
import { TemplateList } from "@/components/admin/template-list";

export const metadata = { title: "Templat halaman" };

export default function TemplatesPage() {
  return (
    <>
      <PageHeader
        title="Templat halaman"
        description="Titik awal untuk halaman baru. Simpan halaman mana pun sebagai templat dari editor (Pengaturan halaman → Simpan sebagai templat)."
        actions={
          <NewPageButton className={buttonClass("accent")}>
            <Plus className="size-4" />
            Halaman baru
          </NewPageButton>
        }
      />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-fill" />}>
        <Templates />
      </Suspense>
    </>
  );
}

async function Templates() {
  const user = await requireUser();
  const templates = await listTemplateChoices();
  return <TemplateList templates={templates} userId={user.id} admin={user.role === "admin"} />;
}
