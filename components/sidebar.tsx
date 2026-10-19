"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { findTab, groupContains, isGroup } from "@/lib/navigation";
import type { NavItem, NavTab } from "@/lib/site-types";
import { SearchField } from "@/components/search";
import { useSite } from "@/components/site-context";

export function useActiveTab(): NavTab | undefined {
  const pathname = usePathname();
  const { tabs } = useSite();
  return findTab(tabs, pathname) ?? tabs[0];
}

function NavEntry({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(() => groupContains(item, pathname));

  if (isGroup(item)) {
    return (
      <li>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex h-8 w-full items-center justify-between gap-2 rounded-md px-2.5 text-left text-sm text-fg-muted transition-colors hover:bg-fill hover:text-fg"
        >
          <span className="truncate">{item.title}</span>
          <ChevronRight
            className={`size-3.5 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
          />
        </button>
        {open && (
          <ul className="mt-0.5 ml-2.5 space-y-0.5 border-l border-line pl-2">
            {item.items.map((child) => (
              <NavEntry
                key={child.title}
                item={child}
                pathname={pathname}
                onNavigate={onNavigate}
              />
            ))}
          </ul>
        )}
      </li>
    );
  }

  const active = item.href === pathname;
  return (
    <li>
      <Link
        href={item.href}
        prefetch={true}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={`flex h-8 items-center rounded-md px-2.5 text-sm transition-colors ${
          active
            ? "bg-fill font-medium text-fg"
            : "text-fg-muted hover:bg-fill/60 hover:text-fg"
        }`}
      >
        <span className="truncate">{item.title}</span>
      </Link>
    </li>
  );
}

export function SidebarNav({ tab, onNavigate }: { tab: NavTab; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label={tab.title} className="space-y-6">
      {tab.sections.map((section) => (
        <div key={section.title}>
          <div className="mb-1.5 px-2.5 text-xs font-medium text-fg">{section.title}</div>
          <ul className="space-y-0.5">
            {section.items.map((item) => (
              <NavEntry
                key={item.title}
                item={item}
                pathname={pathname}
                onNavigate={onNavigate}
              />
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function DocsSidebar() {
  const tab = useActiveTab();
  return (
    <aside className="fixed top-[var(--header-h)] bottom-0 left-0 z-20 hidden w-64 flex-col border-r border-line bg-page lg:flex xl:w-72">
      <div className="px-4 pt-5 pb-3">
        <SearchField />
      </div>
      <div className="flex-1 overflow-y-auto px-4 pt-2 pb-10">
        {tab && <SidebarNav key={tab.title} tab={tab} />}
      </div>
    </aside>
  );
}
