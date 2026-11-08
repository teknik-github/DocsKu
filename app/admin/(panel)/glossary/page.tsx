import { Suspense } from "react";
import { ExternalLink } from "lucide-react";
import { requirePermission } from "@/lib/auth/dal";
import { getGlossary } from "@/lib/data/site";
import { PageHeader, buttonClass } from "@/components/admin/ui";
import { GlossaryManager } from "@/components/admin/glossary-manager";
import { isAiReady } from "@/lib/ai/config";

export const metadata = { title: "Glosarium" };

export default function GlossaryAdminPage() {
  return (
    <>
      <PageHeader
        title="Glosarium"
        description="Istilah dan artinya. Tampil di halaman Glosarium, dan sebagai keterangan saat pembaca mengarahkan kursor ke istilah itu pertama kali di sebuah artikel."
        actions={
          <a href="/glosarium" target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
            <ExternalLink className="size-4" />
            Lihat di situs
          </a>
        }
      />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-fill" />}>
        <Glossary />
      </Suspense>
    </>
  );
}

async function Glossary() {
  await requirePermission("glossary.manage");
  const [glossary, ai] = await Promise.all([getGlossary(), isAiReady()]);
  return <GlossaryManager initial={glossary} ai={ai} />;
}
