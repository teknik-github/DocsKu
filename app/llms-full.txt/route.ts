import { getFullMarkdown } from "@/lib/data/discovery";
import { publicOrigin } from "@/lib/auth/request";
import { absolute, textResponse } from "@/lib/discovery-http";

/** Every public page as Markdown, one after another, for AI tools that read a whole site at once. */
export async function GET(request: Request) {
  const origin = publicOrigin(request);
  const { name, description, pages } = await getFullMarkdown();
  const parts = [`# ${name}`, description ? `> ${description}` : ""].filter(Boolean);
  for (const page of pages) {
    parts.push(`---\n\n# ${page.title}\n\nSumber: ${absolute(origin, page.href)}\n\n${page.markdown.trim()}`);
  }
  return textResponse(parts.join("\n\n") + "\n", "text/plain");
}
