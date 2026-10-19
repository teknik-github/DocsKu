"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { PageCardView } from "@/components/publication/cards";
import { topicSlug } from "@/lib/navigation";
import type { PageCard } from "@/lib/site-types";

export type GhostItem = { card: PageCard; tag: string; tab: string };

/** Topic chips and the card grid. The chosen topic lives in ?topik= so header links can open it. */
export function GhostGrid({ items, tabs }: { items: GhostItem[]; tabs: string[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const topic = params.get("topik") ?? "";
  const shown = topic ? items.filter((item) => topicSlug(item.tab) === topic) : items;

  const choose = (slug: string) => router.replace(slug ? `/docs?topik=${slug}` : "/docs", { scroll: false });
  const chip = (active: boolean) =>
    `h-8 rounded-full px-3.5 text-sm transition-colors ${active ? "bg-fg text-page" : "border border-line bg-surface text-fg-muted hover:text-fg"}`;

  return (
    <>
      {tabs.length > 1 && (
        <div className="mb-10 flex flex-wrap gap-2">
          <button type="button" onClick={() => choose("")} className={chip(!topic)} aria-pressed={!topic}>
            Semua
          </button>
          {tabs.map((tab) => (
            <button key={tab} type="button" onClick={() => choose(topicSlug(tab))} className={chip(topic === topicSlug(tab))} aria-pressed={topic === topicSlug(tab)}>
              {tab}
            </button>
          ))}
        </div>
      )}
      {shown.length === 0 ? (
        <p className="text-sm text-fg-subtle">Belum ada halaman di topik ini.</p>
      ) : (
        <div className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((item, i) => (
            <div key={item.card.href} className={i === 0 && !topic && item.card.featured ? "sm:col-span-2" : ""}>
              <PageCardView card={item.card} tag={item.tag} showFeatured size={i === 0 && !topic && item.card.featured ? "lg" : "md"} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
