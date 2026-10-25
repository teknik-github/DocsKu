import path from "node:path";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/**
 * Applies the SQL migrations in db/migrations (bundled into the Docker image)
 * that the database doesn't have yet. instrumentation.ts runs it before the
 * server takes requests, and the first-run setup page runs it again, so a new
 * install or an upgrade never needs a separate migrate step. It keeps its
 * bookkeeping in drizzle.__drizzle_migrations, the table `pnpm db:migrate`
 * (drizzle-kit) uses, so both can be mixed.
 */

// Any number; serialises migrations when several servers start at once.
const LOCK_ID = 7_446_201;

const state = globalThis as unknown as { docskuMigration?: Promise<void> };

/** Runs at most once per process when it succeeds; a failure is retried on the next call. */
export function migrateDatabase(): Promise<void> {
  state.docskuMigration ??= run().catch((error) => {
    state.docskuMigration = undefined;
    throw error;
  });
  return state.docskuMigration;
}

async function run() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  // One connection of its own, so the advisory lock and the migration share a session.
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const db = drizzle(client);
    await db.execute(sql`select pg_advisory_lock(${LOCK_ID})`);
    try {
      await migrate(db, { migrationsFolder: path.join(process.cwd(), "db/migrations") });
    } finally {
      await db.execute(sql`select pg_advisory_unlock(${LOCK_ID})`);
    }
  } finally {
    await client.end({ timeout: 5 });
  }
}
