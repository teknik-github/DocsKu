import Link from "next/link";
import { Lock } from "lucide-react";
import { T } from "@/components/locale-text";

/** Shown above an internal article: only signed-in team members can read it. */
export function InternalBanner() {
  return (
    <div className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-100">
      <span className="flex items-center gap-2">
        <Lock className="size-4 shrink-0" />
        <T k="internalShort" />
      </span>
      <Link href="/internal" className="font-medium underline-offset-2 hover:underline">
        <T k="allInternal" />
      </Link>
    </div>
  );
}
