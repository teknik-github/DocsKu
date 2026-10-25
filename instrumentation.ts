/**
 * Server startup. First the database gets any pending migrations (set
 * DISABLE_AUTO_MIGRATE=1 to run `pnpm db:migrate` yourself instead). Then
 * background work, done by calling the server's own internal endpoints with
 * CRON_SECRET:
 * - once at startup, /api/internal/refresh marks every cached page stale, so a
 *   restarted server (or a prebuilt image) never serves build-time content;
 * - once a minute, /api/internal/publish-scheduled publishes scheduled pages.
 * On platforms without a long-running server, call both from an external cron
 * instead (POST with `Authorization: Bearer $CRON_SECRET`) and set DISABLE_SCHEDULER=1.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  if (!process.env.DISABLE_AUTO_MIGRATE) {
    const { migrateDatabase } = await import("./lib/migrate");
    try {
      await migrateDatabase();
    } catch (error) {
      // Keep serving: /admin/setup retries and shows the problem.
      console.error("[migrate] could not migrate the database:", error instanceof Error ? error.message : error);
    }
  }

  if (process.env.DISABLE_SCHEDULER) return;
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn("[scheduler] CRON_SECRET is not set; scheduled pages will not publish automatically.");
    return;
  }

  // Never guess a port: another app listening there would receive CRON_SECRET.
  const base = process.env.SCHEDULER_URL ?? (process.env.PORT ? `http://127.0.0.1:${process.env.PORT}` : null);
  if (!base) {
    console.warn("[scheduler] PORT is unknown; set SCHEDULER_URL so scheduled pages publish automatically.");
    return;
  }
  const call = async (path: string) => {
    const res = await fetch(`${base}${path}`, { method: "POST", headers: { authorization: `Bearer ${secret}` } });
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return res.json().catch(() => ({}));
  };

  // Dev hot reloads can call register again; keep a single timer and refresh once.
  const state = globalThis as unknown as { docskuScheduler?: ReturnType<typeof setInterval>; docskuRefreshed?: boolean };
  if (state.docskuScheduler) clearInterval(state.docskuScheduler);

  if (!state.docskuRefreshed) {
    state.docskuRefreshed = true;
    // register() runs before the server listens, so retry until it answers.
    const refresh = async (attempt: number) => {
      try {
        await call("/api/internal/refresh");
      } catch {
        if (attempt < 60) setTimeout(() => refresh(attempt + 1), 1000).unref?.();
        else console.warn("[startup] could not refresh cached pages; they update on the next edit.");
      }
    };
    setTimeout(() => refresh(1), 500).unref?.();
  }

  const tick = async () => {
    try {
      const data = await call("/api/internal/publish-scheduled");
      if (data.published) console.log(`[scheduler] published ${data.published} scheduled page(s)`);
    } catch {
      // Server not ready yet or shutting down; try again next minute.
    }
  };

  state.docskuScheduler = setInterval(tick, 60_000);
  state.docskuScheduler.unref?.();
}
