import { getDiscoveryPages } from "@/lib/data/discovery";
import { getSiteSettings } from "@/lib/data/site";
import { publicOrigin } from "@/lib/auth/request";
import { absolute, textResponse } from "@/lib/discovery-http";

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

/** https://llmstxt.org: the site's name, summary and a link list per navigation section. */
export async function GET(request: Request) {
  const origin = publicOrigin(request);
  const [site, pages] = await Promise.all([getSiteSettings(), getDiscoveryPages()]);
  const groups = new Map<string, typeof pages>();
  for (const page of pages) groups.set(page.group, [...(groups.get(page.group) ?? []), page]);
  const lines = [`# ${oneLine(site.name)}`, ""];
  if (site.description) lines.push(`> ${oneLine(site.description)}`, "");
  lines.push(`Seluruh isi dokumentasi dalam satu berkas Markdown: ${absolute(origin, "/llms-full.txt")}`, "");
  for (const [group, list] of groups) {
    lines.push(`## ${group}`, "");
    for (const page of list) {
      const description = oneLine(page.description);
      lines.push(`- [${oneLine(page.title)}](${absolute(origin, page.href)})${description ? `: ${description}` : ""}`);
    }
    lines.push("");
  }
  return textResponse(lines.join("\n"), "text/plain");
}
