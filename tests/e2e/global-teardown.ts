import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { STATE_DIR, STATE_FILE, maintenanceUrl, testDatabaseUrl } from "./support/env";

/** Stops the test server, drops docsku_test and removes the upload dir (E2E_KEEP=1 keeps all three for debugging). */
export default async function globalTeardown() {
  if (process.env.E2E_KEEP) return;
  const pidFile = path.join(STATE_DIR, "server.pid");
  if (fs.existsSync(pidFile)) {
    const pid = Number(fs.readFileSync(pidFile, "utf8"));
    try {
      process.kill(-pid, "SIGTERM"); // the whole process group (next start and its workers)
    } catch {
      // already gone
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (fs.existsSync(STATE_FILE)) {
    const { uploadDir } = JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) as { uploadDir: string };
    if (uploadDir.includes("docsku-e2e-uploads-")) fs.rmSync(uploadDir, { recursive: true, force: true });
  }
  const dbName = new URL(testDatabaseUrl()).pathname.slice(1);
  const admin = postgres(maintenanceUrl(), { max: 1, onnotice: () => {} });
  await admin.unsafe(`drop database if exists "${dbName}" with (force)`);
  await admin.end();
}
