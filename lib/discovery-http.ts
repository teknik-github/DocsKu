import "server-only";

/** Plain-text/XML responses for crawler files: short browser cache, revalidated by the server's own tags. */
export function textResponse(body: string, type: string) {
  return new Response(body, {
    headers: { "Content-Type": `${type}; charset=utf-8`, "Cache-Control": "public, max-age=300", "X-Robots-Tag": "noindex" },
  });
}

/** Absolute URL on this site; `origin` comes from `publicOrigin(request)` (SITE_URL wins). */
export const absolute = (origin: string, path: string) => `${origin}${path}`;
