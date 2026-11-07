import { HomeArticle } from "@/components/home-article";
import { HomeSections } from "@/components/home/sections";
import { getHomePage, getHomeSections } from "@/lib/data/site";
import { defaultSections } from "@/lib/home-sections";
import { pageMetadata } from "@/lib/seo";

// Beranda: disusun di dasbor → Beranda (bagian-bagian, components/home/sections.tsx).
// Sebelum penyusun pernah disimpan, beranda blok lama yang sudah terbit tetap dipakai.

/** The old block-edited home, only while the section builder has never been published. */
async function legacyHome() {
  const [sections, home] = await Promise.all([getHomeSections(), getHomePage()]);
  return sections === null ? home : null;
}

export async function generateMetadata() {
  const home = await legacyHome();
  if (!home) return {};
  // The home keeps the site name as its default title unless a meta title is set.
  const { title, ...rest } = pageMetadata(home, "website");
  return home.seo?.title ? { title, ...rest } : rest;
}

export default async function Home() {
  const [legacy, sections] = await Promise.all([legacyHome(), getHomeSections()]);
  if (legacy) return <HomeArticle doc={legacy.content} />;
  return <HomeSections sections={sections ?? defaultSections()} />;
}
