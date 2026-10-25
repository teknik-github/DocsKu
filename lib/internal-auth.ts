import "server-only";
import { timingSafeEqual } from "node:crypto";

/** For /api/internal/* routes, which the server (or an external cron) calls with `Authorization: Bearer $CRON_SECRET`. */
export function authorizedInternal(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || given.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}
