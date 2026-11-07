import { Suspense } from "react";
import { requireUser } from "@/lib/auth/dal";
import { isAiReady } from "@/lib/ai/config";
import { AiChat } from "@/components/admin/ai-chat";

export const metadata = { title: "AI Chat" };

export default function AiChatPage({ searchParams }: PageProps<"/admin/ai">) {
  return (
    <Suspense fallback={<div className="flex-1 animate-pulse bg-fill/40" />}>
      <Chat searchParams={searchParams} />
    </Suspense>
  );
}

/** `?tulis=topik` (from Statistik → a search without results) pre-fills a request to write about it. */
async function Chat({ searchParams }: Pick<PageProps<"/admin/ai">, "searchParams">) {
  await requireUser();
  const [enabled, params] = await Promise.all([isAiReady(), searchParams]);
  const topic = typeof params.tulis === "string" ? params.tulis.replace(/\s+/g, " ").trim().slice(0, 120) : "";
  const initial = topic
    ? `Pembaca mencari “${topic}” tetapi dokumentasi belum membahasnya. Periksa dulu apakah ada halaman terkait, lalu usulkan halaman baru yang menjawabnya.`
    : undefined;
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <AiChat layout="page" enabled={enabled} initialInput={initial} />
    </div>
  );
}
