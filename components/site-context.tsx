"use client";

import { createContext, use } from "react";
import type { NavTab, SiteSettings } from "@/lib/site-types";

type SiteData = { site: SiteSettings; tabs: NavTab[] };

const SiteContext = createContext<SiteData | null>(null);

/** Gives client components (header, sidebar) the cached site settings and navigation. */
export function SiteProvider({ value, children }: { value: SiteData; children: React.ReactNode }) {
  return <SiteContext value={value}>{children}</SiteContext>;
}

export function useSite(): SiteData {
  const value = use(SiteContext);
  if (!value) throw new Error("useSite must be used inside <SiteProvider>");
  return value;
}
