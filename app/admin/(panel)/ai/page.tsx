import { Suspense } from "react";
import { requireUser } from "@/lib/auth/dal";
import { isAiReady } from "@/lib/ai/config";
import { AiChat } from "@/components/admin/ai-chat";

export const metadata = { title: "AI Chat" };

export default function AiChatPage() {
  return (
    <Suspense fallback={<div className="flex-1 animate-pulse bg-fill/40" />}>
      <Chat />
    </Suspense>
  );
}

async function Chat() {
  await requireUser();
  const enabled = await isAiReady();
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <AiChat layout="page" enabled={enabled} />
    </div>
  );
}
