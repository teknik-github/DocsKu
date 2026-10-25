import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;

/**
 * `next build` without a database (the Docker image built on GitHub): public
 * reads in lib/data/site.ts return nothing, and the running server marks every
 * page stale at startup (/api/internal/refresh), so the empty build output is
 * never shown.
 */
export const buildingWithoutDatabase = !url && process.env.NEXT_PHASE === "phase-production-build";
if (!url && !buildingWithoutDatabase) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");

// Reuse one connection pool across dev hot reloads.
const globalForDb = globalThis as unknown as { docskuSql?: postgres.Sql };
const client = globalForDb.docskuSql ?? postgres(url ?? "postgres://build@127.0.0.1:1/unused", { max: 10 });
if (process.env.NODE_ENV !== "production") globalForDb.docskuSql = client;

export const db = drizzle(client, { schema });
export { schema };
