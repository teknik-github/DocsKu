import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { countHit, findRedirect, normalisePath } from "@/lib/redirects";
import { widgetEnabled, widgetFrameSources } from "@/lib/widget-frame";
import { PROXY_SESSION_COOKIE, authorExists, docPathAccess, languageHomeExists, widgetArticleExists } from "@/lib/route-exists";

/** First path segments owned by other routes; anything else with one segment may be a language home (/<code>). */
const TOP_LEVEL = new Set(["admin", "api", "docs", "internal", "penulis", "preview", "cover", "media", "widget", "terbaru", "glosarium", "_next"]);

/**
 * A real 404 for a missing page: rewritten to a path no route matches, so the
 * router answers with app/not-found.tsx and status 404 (the URL stays as typed).
 * Without this, dynamic routes would stream their App Shell with status 200.
 */
function notFoundResponse(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/_/tidak-ditemukan";
  url.search = "";
  return NextResponse.rewrite(url);
}

/** Runs a check; a database error lets the request through (the page still decides). */
async function exists(check: () => Promise<boolean>) {
  try {
    return await check();
  } catch {
    return true;
  }
}

/**
 * Old /docs addresses (a page's previous slug, or a manual redirect from
 * /admin/redirects) answer with a permanent redirect before rendering, so
 * search engines see a real 308 instead of a client-side hop. Paths owned by a
 * published page are never in the redirect map (lib/redirects.ts).
 */
export async function proxy(request: NextRequest, event: NextFetchEvent) {
  // The help widget (/widget…) may be framed only by the origins set in Pengaturan → Widget bantuan.
  // next.config.ts sends "frame-ancestors 'none'" there; this replaces it per request.
  const { pathname } = request.nextUrl;
  if (pathname === "/widget" || pathname.startsWith("/widget/")) {
    // On/off is decided here, per request, so switching the widget on takes effect at once.
    if (!(await widgetEnabled())) return notFoundResponse(request);
    const article = pathname.match(/^\/widget\/a\/(.+)$/);
    if (article && !(await exists(() => widgetArticleExists(safeDecode(article[1]))))) return notFoundResponse(request);
    const response = NextResponse.next();
    response.headers.set("Content-Security-Policy", `frame-ancestors ${await widgetFrameSources()}`);
    return response;
  }
  const author = pathname.match(/^\/penulis\/([^/]+)\/?$/);
  if (author) return (await exists(() => authorExists(safeDecode(author[1])))) ? NextResponse.next() : notFoundResponse(request);
  const single = pathname.match(/^\/([^/.]+)\/?$/);
  if (single) {
    if (TOP_LEVEL.has(single[1])) return NextResponse.next();
    return (await exists(() => languageHomeExists(safeDecode(single[1])))) ? NextResponse.next() : notFoundResponse(request);
  }
  if (!pathname.startsWith("/docs/")) return NextResponse.next();

  let path: string;
  try {
    path = normalisePath(decodeURIComponent(pathname));
  } catch {
    return NextResponse.next();
  }
  const target = await findRedirect(path).catch(() => null);
  if (!target) {
    // The page looks slugs up exactly as written (params), so check the same string.
    const slug = safeDecode(pathname).replace(/^\/docs\//, "").replace(/\/+$/, "");
    const token = request.cookies.get(PROXY_SESSION_COOKIE)?.value;
    let access: "public" | "internal" | "missing";
    try {
      access = await docPathAccess(slug, token);
    } catch {
      access = "public"; // A database error lets the request through (the page still decides).
    }
    if (access === "missing") return notFoundResponse(request);
    if (access === "public") return NextResponse.next();
    // Internal articles must never be kept by browsers, proxies or the offline cache (sw.js skips no-store).
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  event.waitUntil(countHit(target.id).catch(() => {}));
  if (/^https?:\/\//i.test(target.url)) return NextResponse.redirect(target.url, 308);
  const url = request.nextUrl.clone();
  url.pathname = target.url;
  return NextResponse.redirect(url, 308);
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export const config = {
  // "/:segment" covers language homes (/en); other one-segment routes are let through above.
  matcher: ["/docs/:path+", "/widget", "/widget/:path*", "/penulis/:username", "/:segment"],
};
