import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { countHit, findRedirect, normalisePath } from "@/lib/redirects";

/**
 * Old /docs addresses (a page's previous slug, or a manual redirect from
 * /admin/redirects) answer with a permanent redirect before rendering, so
 * search engines see a real 308 instead of a client-side hop. Paths owned by a
 * published page are never in the redirect map (lib/redirects.ts).
 */
export async function proxy(request: NextRequest, event: NextFetchEvent) {
  let path: string;
  try {
    path = normalisePath(decodeURIComponent(request.nextUrl.pathname));
  } catch {
    return NextResponse.next();
  }
  const target = await findRedirect(path).catch(() => null);
  if (!target) return NextResponse.next();
  event.waitUntil(countHit(target.id).catch(() => {}));
  if (/^https?:\/\//i.test(target.url)) return NextResponse.redirect(target.url, 308);
  const url = request.nextUrl.clone();
  url.pathname = target.url;
  return NextResponse.redirect(url, 308);
}

export const config = {
  matcher: "/docs/:path+",
};
