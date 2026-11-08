import type { Metadata } from "next";
import { getLanguageSettings } from "@/lib/data/site";
import { DocsHub } from "@/components/docs-hub";
import { t } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const languages = await getLanguageSettings();
  // Each language's hub points at the others.
  const alternates = languages.languages.length
    ? { languages: Object.fromEntries([[languages.defaultLocale, "/docs"], ...languages.languages.map((l) => [l.code, `/docs/${l.code}`]), ["x-default", "/docs"]]) }
    : undefined;
  return { title: t(languages.defaultLocale, "docs"), alternates };
}

/** Overview of every tab and section, linking to each page. */
export default function DocsIndex() {
  return <DocsHub />;
}
