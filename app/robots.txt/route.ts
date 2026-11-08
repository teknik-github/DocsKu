import { publicOrigin } from "@/lib/auth/request";
import { textResponse } from "@/lib/discovery-http";

/** Crawl the public site; keep out of the dashboard, previews and APIs. */
export async function GET(request: Request) {
  const origin = publicOrigin(request);
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin",
    "Disallow: /preview",
    "Disallow: /api/",
    "Disallow: /widget",
    "",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n");
  return textResponse(body, "text/plain");
}
