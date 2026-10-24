import { revalidateTag } from "next/cache";
import { connection } from "next/server";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { allow } from "@/lib/auth/rate-limit";
import { isSameOrigin, publicOrigin } from "@/lib/auth/request";
import { createDocskuServer } from "@/lib/mcp/server";
import { verifyToken, type TokenPrincipal } from "@/lib/mcp/tokens";
import type { Invalidate } from "@/lib/pages/service";

/**
 * MCP endpoint (Streamable HTTP, stateless). Authenticated with personal API
 * tokens from the dashboard (Authorization: Bearer dk_…); see lib/mcp/server.ts.
 */

type Extra = { principal: TokenPrincipal; baseUrl: string; invalidate: Invalidate };

const handler = createMcpHandler(
  ({ authInfo }) => {
    const { principal, baseUrl, invalidate } = authInfo?.extra as Extra;
    return createDocskuServer({ principal, baseUrl, invalidate });
  },
  { maxRequestBodySize: 1_000_000 },
);

const error = (status: number, message: string, headers: HeadersInit = {}) =>
  Response.json({ error: message }, { status, headers });

async function handle(request: Request) {
  await connection();
  // MCP clients are not browsers; a cross-origin browser request is DNS rebinding or CSRF.
  if (!isSameOrigin(request)) return error(403, "Cross-origin request rejected.");

  const token = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const challenge = { "WWW-Authenticate": 'Bearer realm="docsku", error="invalid_token"' };
  if (!token) return error(401, "Missing bearer token. Create one under MCP in the Docsku dashboard.", challenge);
  const principal = await verifyToken(token);
  if (!principal) return error(401, "Invalid or expired token.", challenge);
  if (!allow(`mcp:${principal.tokenId}`, 120, 60_000)) return error(429, "Too many requests. Slow down.", { "Retry-After": "60" });

  // Tools run inside the SDK, outside the request scope Next.js tracks, so they only collect the
  // cache tags to refresh; this handler expires them once the tool call has fully answered.
  const stale = new Set<Parameters<Invalidate>[0]>();
  const extra: Extra = { principal, baseUrl: publicOrigin(request), invalidate: (tag) => stale.add(tag) };
  const isToolCall =
    request.method === "POST" && ((await request.clone().json().catch(() => null)) as { method?: string } | null)?.method === "tools/call";

  const response = await handler.fetch(request, {
    authInfo: { token: principal.tokenId, clientId: principal.tokenId, scopes: principal.scopes, extra },
  });
  if (!isToolCall) return response;
  // 2025-era clients get the result as a short SSE stream; read it to the end before expiring.
  const body = await response.arrayBuffer();
  for (const tag of stale) revalidateTag(tag, { expire: 0 });
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
}

export { handle as GET, handle as POST, handle as DELETE };
