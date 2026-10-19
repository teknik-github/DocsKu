/**
 * Small in-memory limiter for login attempts. Good enough for a single server;
 * use a shared store (e.g. Redis) if you run several instances.
 */
const attempts = new Map<string, { count: number; resetAt: number }>();

export function isRateLimited(key: string, limit = 5): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) return false;
  return entry.count >= limit;
}

export function recordFailure(key: string, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) attempts.set(key, { count: 1, resetAt: now + windowMs });
  else entry.count++;
  if (attempts.size > 10_000) {
    for (const [k, v] of attempts) if (v.resetAt < now) attempts.delete(k);
  }
}

export function clearFailures(key: string) {
  attempts.delete(key);
}

/** Counts one use of `key`; returns false once `limit` uses happen within the window. */
export function allow(key: string, limit: number, windowMs: number): boolean {
  if (isRateLimited(key, limit)) return false;
  recordFailure(key, windowMs);
  return true;
}
