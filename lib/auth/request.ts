import "server-only";

/**
 * Request details that depend on whether a reverse proxy sits in front of the
 * app. Forwarded headers (X-Forwarded-For/-Host) are only believed with
 * TRUST_PROXY=1; without a proxy any client can send them.
 */
const trustProxy = () => process.env.TRUST_PROXY === "1";

/** The client's IP as reported by a trusted proxy, or null when it can't be known. */
export function clientIp(headers: Headers): string | null {
  if (!trustProxy()) return null;
  return headers.get("x-forwarded-for")?.split(",")[0].trim() || headers.get("x-real-ip") || null;
}

/**
 * Rejects cross-origin requests to cookie-authenticated route handlers (server
 * actions get the same check from Next.js). SameSite=Lax cookies are still
 * sent from other ports on the same host, which count as "same-site".
 */
export function isSameOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true; // Browsers send Origin on cross-origin requests; its absence means same-origin or non-browser.
  const host = (trustProxy() && request.headers.get("x-forwarded-host")) || request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
