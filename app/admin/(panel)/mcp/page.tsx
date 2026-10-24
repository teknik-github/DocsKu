import { Suspense } from "react";
import { headers } from "next/headers";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth/dal";
import { readMcpServers, toServerView } from "@/lib/mcp/external";
import { McpTokens } from "@/components/admin/mcp-tokens";
import { McpServers } from "@/components/admin/mcp-servers";
import { PageHeader } from "@/components/admin/ui";

export const metadata = { title: "MCP" };

export default function McpPage() {
  return (
    <>
      <PageHeader
        title="MCP"
        description="Hubungkan Docsku dengan aplikasi AI lewat Model Context Protocol: Claude, Cursor, dan klien MCP lain bisa membaca dan menulis dokumentasi, dan AI Chat bisa memakai tool dari server MCP lain."
      />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-fill" />}>
        <Mcp />
      </Suspense>
    </>
  );
}

async function Mcp() {
  const user = await requireUser();
  const h = await headers();
  const origin = process.env.SITE_URL?.replace(/\/+$/, "") || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const [tokens, servers] = await Promise.all([
    db
      .select({
        id: schema.apiTokens.id,
        name: schema.apiTokens.name,
        prefix: schema.apiTokens.prefix,
        scopes: schema.apiTokens.scopes,
        expiresAt: schema.apiTokens.expiresAt,
        expired: sql<boolean>`${schema.apiTokens.expiresAt} is not null and ${schema.apiTokens.expiresAt} <= now()`,
        lastUsedAt: schema.apiTokens.lastUsedAt,
        createdAt: schema.apiTokens.createdAt,
      })
      .from(schema.apiTokens)
      .where(eq(schema.apiTokens.userId, user.id))
      .orderBy(desc(schema.apiTokens.createdAt)),
    user.role === "admin" ? readMcpServers() : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-10">
      <McpTokens
        endpoint={`${origin}/api/mcp`}
        tokens={tokens.map((token) => ({
          ...token,
          expiresAt: token.expiresAt?.toISOString() ?? null,
          lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
          createdAt: token.createdAt.toISOString(),
        }))}
      />
      {user.role === "admin" && (
        <McpServers initial={servers.map(toServerView)} />
      )}
    </div>
  );
}
