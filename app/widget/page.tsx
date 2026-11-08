import { notFound } from "next/navigation";
import { getAskAiAvailable, getPopularPages, getSearchIndex, getWidgetSettings } from "@/lib/data/site";
import { WidgetHome } from "@/components/widget/home";

const POPULAR = 5;

export default async function WidgetPage() {
  const [widget, index, askAi, popularHrefs] = await Promise.all([getWidgetSettings(), getSearchIndex(), getAskAiAvailable(), getPopularPages(POPULAR)]);
  if (!widget.enabled) notFound();

  // Most read first, topped up with the first articles of the navigation. Only public pages are in the index.
  const byHref = new Map(index.map((entry) => [entry.href, entry]));
  const hrefs = [...new Set([...popularHrefs, ...index.map((entry) => entry.href)])].filter((href) => byHref.has(href)).slice(0, POPULAR);
  const popular = hrefs.map((href) => {
    const entry = byHref.get(href)!;
    return { href, title: entry.title, section: entry.section };
  });

  return <WidgetHome index={index} ai={widget.ai && askAi} greeting={widget.greeting} popular={popular} />;
}
