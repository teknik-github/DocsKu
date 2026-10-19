/**
 * Starts the scheduled-publish ticker: once a minute the server calls its own
 * /api/internal/publish-scheduled endpoint. On platforms without a long-running
 * server, call that endpoint from an external cron instead (POST with
 * `Authorization: Bearer $CRON_SECRET`) and set DISABLE_SCHEDULER=1.
 */
export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build" || process.env.DISABLE_SCHEDULER) return;
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn("[scheduler] CRON_SECRET is not set; scheduled pages will not publish automatically.");
    return;
  }

  // Dev hot reloads can call register again; keep a single timer.
  const state = globalThis as unknown as { docskuScheduler?: ReturnType<typeof setInterval> };
  if (state.docskuScheduler) clearInterval(state.docskuScheduler);

  let warned = false;
  const tick = async () => {
    // Never guess a port: another app listening there would receive CRON_SECRET.
    const base = process.env.SCHEDULER_URL ?? (process.env.PORT ? `http://127.0.0.1:${process.env.PORT}` : null);
    if (!base) {
      if (!warned) console.warn("[scheduler] PORT is unknown; set SCHEDULER_URL so scheduled pages publish automatically.");
      warned = true;
      return;
    }
    try {
      const res = await fetch(`${base}/api/internal/publish-scheduled`, {
        method: "POST",
        headers: { authorization: `Bearer ${secret}` },
      });
      const data = await res.json().catch(() => ({}));
      if (data.published) console.log(`[scheduler] published ${data.published} scheduled page(s)`);
    } catch {
      // Server not ready yet or shutting down; try again next minute.
    }
  };

  state.docskuScheduler = setInterval(tick, 60_000);
  state.docskuScheduler.unref?.();
}
