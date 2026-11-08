import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/dal";
import { can } from "@/lib/auth/permissions";
import { canEditPage } from "@/lib/auth/page-access";
import { getApprovalInfo } from "@/lib/collab/approval";
import { getPageForEditor, listRevisions } from "@/lib/data/admin";
import { PageEditor } from "@/components/admin/editor/page-editor";
import { isAiReady } from "@/lib/ai/config";
import { navigationForEditor, readAutomation } from "@/lib/automation";

export const metadata = { title: "Edit halaman" };

export default function EditPage({ params }: PageProps<"/admin/pages/[id]">) {
  return (
    <Suspense fallback={<div className="h-14 border-b border-line" />}>
      <EditorLoader params={params} />
    </Suspense>
  );
}

async function EditorLoader({ params }: Pick<PageProps<"/admin/pages/[id]">, "params">) {
  const user = await requireUser();
  const { id } = await params;
  const [page, revisions, aiEnabled, navigation, automation] = await Promise.all([
    getPageForEditor(id),
    listRevisions(id),
    isAiReady(),
    navigationForEditor(id),
    readAutomation(),
  ]);
  if (!page) notFound();
  // Contributors only open their own pages.
  if (!(await canEditPage(user, page.id))) redirect("/admin/pages");
  const approval = await getApprovalInfo(page.id);

  return (
    <PageEditor
      page={{
        id: page.id,
        kind: page.kind,
        slug: page.slug,
        status: page.status,
        publishedAt: page.publishedAt?.toISOString() ?? null,
        hasChanges: page.hasChanges,
        title: page.draftTitle,
        description: page.draftDescription,
        content: page.draftContent,
        seo: page.draftSeo,
        cover: page.draftCoverImage,
        featured: page.featured,
        visibility: page.visibility,
        updatedAt: page.updatedAt.toISOString(),
        draftVersion: page.draftVersion,
        approval,
      }}
      revisions={revisions.map((revision) => ({ ...revision, createdAt: revision.createdAt.toISOString() }))}
      aiEnabled={aiEnabled}
      navigation={{ ...navigation, navSection: page.navSection, auto: automation.navigation }}
      isAdmin={user.role === "admin"}
      permissions={{ publish: can(user, "pages.publish"), approve: can(user, "pages.approve"), staff: can(user, "pages.editAny"), templates: can(user, "templates.manage") }}
      viewer={{ id: user.id, name: user.name }}
    />
  );
}
