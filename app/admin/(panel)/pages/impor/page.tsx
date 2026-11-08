import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { readNavigation, sectionOptions } from "@/lib/automation";
import { ImportWizard } from "@/components/admin/import-wizard";
import { PageHeader } from "@/components/admin/ui";

export const metadata = { title: "Impor halaman" };

export default function ImportPage() {
  return (
    <>
      <Link href="/admin/pages" className="mb-4 inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="size-4" />
        Halaman
      </Link>
      <PageHeader
        title="Impor halaman"
        description="Unggah berkas Markdown/MDX atau ZIP dari GitBook, Notion, Docusaurus, Mintlify, atau ekspor Docsku. Semuanya masuk sebagai draf."
      />
      <Suspense fallback={<div className="h-72 animate-pulse rounded-xl bg-fill" />}>
        <Wizard />
      </Suspense>
    </>
  );
}

async function Wizard() {
  const user = await requireUser();
  const navigation = await readNavigation();
  return (
    <ImportWizard
      sections={sectionOptions(navigation)}
      tabs={navigation.tabs.map((tab) => tab.title)}
      canCreateCategories={user.role === "admin"}
    />
  );
}
