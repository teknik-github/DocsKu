import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { BASE_URL, DIST_DIR, PORT, ROOT, STATE_DIR, STATE_FILE, maintenanceUrl, testDatabaseUrl, type E2EState } from "./support/env";
import { seed } from "./support/seed";

/**
 * 1. Recreates the test database (docsku_test), applies db/migrations and seeds it.
 * 2. Builds the app into .next-e2e (skip with E2E_SKIP_BUILD=1 to reuse the last build).
 * 3. Starts `next start` on port 3019 against that database, with its own upload dir,
 *    no AI key and no AI settings, so nothing can reach a real AI provider.
 * 4. Signs in the admin and the editor once and saves their sessions.
 */
export default async function globalSetup() {
  if (await answers(`${BASE_URL}/`)) throw new Error(`e2e: something already listens on port ${PORT}; set E2E_PORT to a free port.`);
  // A previous run that was kept (E2E_KEEP) or failed during setup leaves its upload dir behind.
  if (fs.existsSync(STATE_FILE)) {
    const previous = JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) as Partial<E2EState>;
    if (previous.uploadDir?.includes("docsku-e2e-uploads-")) fs.rmSync(previous.uploadDir, { recursive: true, force: true });
  }
  fs.rmSync(STATE_DIR, { recursive: true, force: true });
  fs.mkdirSync(STATE_DIR, { recursive: true });

  const databaseUrl = testDatabaseUrl();
  const dbName = new URL(databaseUrl).pathname.slice(1);
  const admin = postgres(maintenanceUrl(), { max: 1, onnotice: () => {} });
  await admin.unsafe(`drop database if exists "${dbName}" with (force)`);
  await admin.unsafe(`create database "${dbName}"`);
  await admin.end();

  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  await migrate(drizzle(sql), { migrationsFolder: path.join(ROOT, "db/migrations") });
  const users = await seed(sql);
  const aiRows = await sql`select 1 from settings where key = 'ai'`;
  await sql.end();
  if (aiRows.length) throw new Error("e2e: the test database must not have AI settings.");

  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "docsku-e2e-uploads-"));
  const cronSecret = randomBytes(24).toString("hex");
  const state: E2EState = { baseURL: BASE_URL, databaseUrl, cronSecret, uploadDir, users };
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), { mode: 0o600 });
  // Every variable the app reads is set here, so nothing comes from .env.local
  // (Next.js never overrides a variable that is already set, even to "").
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    NEXT_DIST_DIR: DIST_DIR,
    DATABASE_URL: databaseUrl,
    CRON_SECRET: cronSecret,
    UPLOAD_DIR: uploadDir,
    ENCRYPTION_KEY: randomBytes(32).toString("hex"),
    PORT: String(PORT),
    AI_API_KEY: "",
    SITE_URL: "",
    TRUST_PROXY: "",
    SCHEDULER_URL: "",
    DEV_ORIGINS: "",
    DISABLE_AUTO_MIGRATE: "",
    DISABLE_SCHEDULER: "",
    // Lets custom webhooks reach the spec's local receiver (off in real deployments).
    WEBHOOK_ALLOW_PRIVATE: "1",
  };

  const next = path.join(ROOT, "node_modules/.bin/next");
  if (!process.env.E2E_SKIP_BUILD || !fs.existsSync(path.join(ROOT, DIST_DIR, "BUILD_ID"))) {
    const build = spawnSync(next, ["build"], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
    fs.writeFileSync(path.join(STATE_DIR, "build.log"), `${build.stdout}\n${build.stderr}`);
    if (build.status !== 0) throw new Error(`e2e: next build failed, see tests/e2e/.state/build.log\n${build.stderr.slice(-2000)}`);
  }

  const log = fs.openSync(path.join(STATE_DIR, "server.log"), "w");
  const server = spawn(next, ["start", "-p", String(PORT), "-H", "127.0.0.1"], { cwd: ROOT, env, stdio: ["ignore", log, log], detached: true });
  server.unref();
  fs.writeFileSync(path.join(STATE_DIR, "server.pid"), String(server.pid));
  await waitFor(`${BASE_URL}/api/health`, 120_000);
  // The startup refresh (instrumentation.ts) runs right after the server listens; wait for the home page.
  await waitFor(`${BASE_URL}/`, 60_000);

  const browser = await chromium.launch({ chromiumSandbox: false });
  for (const role of ["admin", "editor"] as const) {
    const context = await browser.newContext({ baseURL: BASE_URL });
    const page = await context.newPage();
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(users[role].email);
    await page.getByLabel("Password").fill(users[role].password);
    await page.getByRole("button", { name: "Masuk", exact: true }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/admin/login"), { timeout: 60_000 });
    await context.storageState({ path: path.join(STATE_DIR, `${role}.json`) });
    await context.close();
  }
  await browser.close();
}

async function answers(url: string) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(2000) });
    return true;
  } catch {
    return false;
  }
}

async function waitFor(url: string, timeout: number) {
  const until = Date.now() + timeout;
  let last = "";
  while (Date.now() < until) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
      last = `HTTP ${res.status}`;
    } catch (error) {
      last = String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`e2e: ${url} did not answer in time (${last}); see tests/e2e/.state/server.log`);
}
