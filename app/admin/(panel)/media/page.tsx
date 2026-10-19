import { Suspense } from "react";
import { requireUser } from "@/lib/auth/dal";
import { listMedia } from "@/lib/data/admin";
import { mediaUrl } from "@/lib/media";
import { MediaLibrary } from "@/components/admin/media-library";
import { PageHeader } from "@/components/admin/ui";

export const metadata = { title: "Media" };

export default function MediaPage() {
  return (
    <>
      <PageHeader title="Media" description="Gambar yang diunggah untuk halaman dokumentasi." />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-fill" />}>
        <MediaList />
      </Suspense>
    </>
  );
}

async function MediaList() {
  await requireUser();
  const items = await listMedia();
  return (
    <MediaLibrary
      items={items.map((item) => ({
        id: item.id,
        url: mediaUrl(item.filename),
        originalName: item.originalName,
        size: item.size,
        createdAt: item.createdAt.toISOString(),
        uploadedBy: item.uploadedBy,
      }))}
    />
  );
}
