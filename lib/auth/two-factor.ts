import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { decryptSecret } from "@/lib/crypto";
import { hashRecoveryCode, matchTotp } from "@/lib/auth/totp";

/**
 * Two-step login. A correct password for a user with 2FA creates a
 * `login_challenges` row and the `docsku_mfa` cookie (never a session); the
 * second step (/admin/login/verify) checks a TOTP or recovery code and only
 * then creates the session. A challenge can't authenticate anything else.
 */

export const CHALLENGE_COOKIE = "docsku_mfa";
const CHALLENGE_MINUTES = 10;
/** Wrong codes allowed per challenge; then the login starts over. */
export const CHALLENGE_ATTEMPTS = 5;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

async function isHttps() {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? (h.get("origin")?.startsWith("https://") ? "https" : "http");
  return proto.split(",")[0].trim() === "https";
}

export async function createLoginChallenge(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + CHALLENGE_MINUTES * 60 * 1000);
  await db.delete(schema.loginChallenges).where(lt(schema.loginChallenges.expiresAt, sql`now()`));
  await db.insert(schema.loginChallenges).values({ id: hashToken(token), userId, expiresAt });
  (await cookies()).set(CHALLENGE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: await isHttps(),
    path: "/admin",
    expires: expiresAt,
  });
}

/** The pending challenge of this browser, or null. */
export async function readLoginChallenge() {
  const token = (await cookies()).get(CHALLENGE_COOKIE)?.value;
  if (!token) return null;
  const [row] = await db
    .select({
      id: schema.loginChallenges.id,
      attempts: schema.loginChallenges.attempts,
      userId: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      totpSecret: schema.users.totpSecret,
      totpEnabledAt: schema.users.totpEnabledAt,
    })
    .from(schema.loginChallenges)
    .innerJoin(schema.users, eq(schema.loginChallenges.userId, schema.users.id))
    .where(and(eq(schema.loginChallenges.id, hashToken(token)), gt(schema.loginChallenges.expiresAt, sql`now()`)));
  return row ?? null;
}

export async function clearLoginChallenge(id?: string) {
  const store = await cookies();
  if (id) await db.delete(schema.loginChallenges).where(eq(schema.loginChallenges.id, id));
  store.delete({ name: CHALLENGE_COOKIE, path: "/admin" });
}

/** Counts a wrong code; returns the attempts left. */
export async function recordChallengeFailure(id: string) {
  const [row] = await db
    .update(schema.loginChallenges)
    .set({ attempts: sql`${schema.loginChallenges.attempts} + 1` })
    .where(eq(schema.loginChallenges.id, id))
    .returning({ attempts: schema.loginChallenges.attempts });
  return Math.max(0, CHALLENGE_ATTEMPTS - (row?.attempts ?? CHALLENGE_ATTEMPTS));
}

/** Last accepted TOTP step per user, so a code can't be replayed within its window (single server). */
const usedSteps = new Map<string, number>();

/**
 * Checks a code for a user with 2FA: a 6-digit TOTP code, or else one of the
 * recovery codes, which is then used up. Returns what matched, or null.
 */
export async function checkSecondFactor(
  user: { userId: string; totpSecret: string | null },
  code: string,
): Promise<"totp" | "recovery" | null> {
  const trimmed = code.trim();
  if (/^\d[\d\s]{4,}\d$/.test(trimmed)) {
    const secret = user.totpSecret ? decryptSecret(user.totpSecret) : null;
    if (!secret) return null;
    const step = matchTotp(secret, trimmed);
    if (step === null || (usedSteps.get(user.userId) ?? -1) >= step) return null;
    usedSteps.set(user.userId, step);
    if (usedSteps.size > 5000) usedSteps.clear();
    return "totp";
  }
  // Recovery code: remove its hash in one statement, so it can only be used once.
  const hash = hashRecoveryCode(trimmed);
  const used = await db
    .update(schema.users)
    .set({ recoveryCodes: sql`array_remove(${schema.users.recoveryCodes}, ${hash})` })
    .where(and(eq(schema.users.id, user.userId), sql`${hash} = any(${schema.users.recoveryCodes})`))
    .returning({ id: schema.users.id });
  return used.length ? "recovery" : null;
}

/** Whether 2FA is on for a user, and how many recovery codes are left. */
export async function twoFactorStatus(userId: string) {
  const [row] = await db
    .select({ enabledAt: schema.users.totpEnabledAt, codes: sql<number>`cardinality(${schema.users.recoveryCodes})::int` })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  return { enabled: Boolean(row?.enabledAt), enabledAt: row?.enabledAt?.toISOString() ?? null, recoveryLeft: row?.codes ?? 0 };
}
