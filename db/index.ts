import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");

// Reuse one connection pool across dev hot reloads.
const globalForDb = globalThis as unknown as { docskuSql?: postgres.Sql };
const client = globalForDb.docskuSql ?? postgres(url, { max: 10 });
if (process.env.NODE_ENV !== "production") globalForDb.docskuSql = client;

export const db = drizzle(client, { schema });
export { schema };
