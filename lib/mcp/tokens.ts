import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Role } from "@/db/schema";
import { TOKEN_PATTERN, isMcpScope, type McpScope } from "@/lib/mcp/scopes";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** Creates a token and returns it once; only its hash is stored. */
export async function issueToken(userId: string, name: string, scopes: McpScope[], expiresAt: Date | null) {
  const token = `dk_${randomBytes(32).toString("base64url")}`;
  const [row] = await db
    .insert(schema.apiTokens)
    .values({ userId, name, tokenHash: hash(token), prefix: token.slice(0, 9), scopes, expiresAt })
    .returning({ id: schema.apiTokens.id });
  return { id: row.id, token };
}

export type TokenPrincipal = { tokenId: string; userId: string; name: string; role: Role; scopes: McpScope[] };

/** The user and scopes behind a bearer token, or null if it is unknown, expired, or malformed. */
export async function verifyToken(token: string): Promise<TokenPrincipal | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  const [row] = await db
    .select({
      tokenId: schema.apiTokens.id,
      userId: schema.users.id,
      name: schema.users.name,
      role: schema.users.role,
      scopes: schema.apiTokens.scopes,
      lastUsedAt: schema.apiTokens.lastUsedAt,
    })
    .from(schema.apiTokens)
    .innerJoin(schema.users, eq(schema.users.id, schema.apiTokens.userId))
    .where(
      and(
        eq(schema.apiTokens.tokenHash, hash(token)),
        or(isNull(schema.apiTokens.expiresAt), gt(schema.apiTokens.expiresAt, sql`now()`)),
      ),
    );
  if (!row) return null;
  // Record use at most once a minute.
  await db
    .update(schema.apiTokens)
    .set({ lastUsedAt: sql`now()` })
    .where(
      and(
        eq(schema.apiTokens.id, row.tokenId),
        or(isNull(schema.apiTokens.lastUsedAt), lt(schema.apiTokens.lastUsedAt, sql`now() - interval '1 minute'`)),
      ),
    );
  return { tokenId: row.tokenId, userId: row.userId, name: row.name, role: row.role, scopes: row.scopes.filter(isMcpScope) };
}
