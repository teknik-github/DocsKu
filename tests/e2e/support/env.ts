import fs from "node:fs";
import path from "node:path";

/**
 * Where the e2e suite runs: its own database (`docsku_test` on the dev
 * Postgres server, or E2E_DATABASE_URL), its own upload dir, its own build
 * (.next-e2e) and server (port 3019). Nothing here touches the dev database.
 */
export const ROOT = path.resolve(__dirname, "../../..");
export const PORT = Number(process.env.E2E_PORT || 3019);
export const BASE_URL = `http://127.0.0.1:${PORT}`;
export const DIST_DIR = ".next-e2e";
export const STATE_DIR = path.join(ROOT, "tests/e2e/.state");
export const STATE_FILE = path.join(STATE_DIR, "state.json");

/** Reads DATABASE_URL from the environment or .env.local (only to learn the server's host/credentials). */
function devDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const file = path.join(ROOT, ".env.local");
  if (fs.existsSync(file)) {
    const line = fs.readFileSync(file, "utf8").split("\n").find((l) => l.startsWith("DATABASE_URL="));
    if (line) return line.slice("DATABASE_URL=".length).trim().replace(/^["']|["']$/g, "");
  }
  throw new Error("e2e: set E2E_DATABASE_URL or DATABASE_URL (or create .env.local).");
}

/** The test database URL. Refuses anything whose database name doesn't end in "_test". */
export function testDatabaseUrl(): string {
  const url = new URL(process.env.E2E_DATABASE_URL || devDatabaseUrl());
  if (!process.env.E2E_DATABASE_URL) url.pathname = "/docsku_test";
  const name = url.pathname.slice(1);
  if (!/_test$/.test(name)) throw new Error(`e2e: refusing to use database "${name}" (name must end in _test).`);
  return url.toString();
}

/** Same server, maintenance database, for CREATE/DROP DATABASE. */
export function maintenanceUrl(): string {
  const url = new URL(testDatabaseUrl());
  url.pathname = "/postgres";
  return url.toString();
}

export type Account = { email: string; password: string; name: string };
export type E2EState = {
  baseURL: string;
  databaseUrl: string;
  cronSecret: string;
  uploadDir: string;
  users: Record<"admin" | "editor" | "twofa" | "strict" | "lockout", Account>;
};

export function readState(): E2EState {
  return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) as E2EState;
}
