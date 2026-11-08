"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { count, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { getDummyHash, hashPassword, verifyPassword } from "@/lib/auth/password";
import { clearFailures, isRateLimited, recordFailure } from "@/lib/auth/rate-limit";
import { clientIp } from "@/lib/auth/request";
import { createSession, destroySession } from "@/lib/auth/session";
import { getCurrentUser } from "@/lib/auth/dal";
import {
  CHALLENGE_ATTEMPTS,
  checkSecondFactor,
  clearLoginChallenge,
  createLoginChallenge,
  readLoginChallenge,
  recordChallengeFailure,
} from "@/lib/auth/two-factor";
import { logActivity } from "@/lib/activity";
import { getSecuritySettings } from "@/lib/data/security";
import { emailSchema, fieldErrors, keepValues, passwordSchema, type FormState } from "@/lib/validation";

/** Failed logins allowed per 15 minutes. */
const LOGIN_LIMIT_PER_ACCOUNT = 10;
const LOGIN_LIMIT_PER_IP = 20;

const setupSchema = z
  .object({
    name: z.string().trim().min(1, "Nama wajib diisi.").max(100),
    email: emailSchema,
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((data) => data.password === data.confirm, {
    path: ["confirm"],
    message: "Password tidak sama.",
  });

/** Creates the first admin. Only works while there are no users. */
export async function setupAction(_: FormState, formData: FormData): Promise<FormState> {
  const values = keepValues(formData, ["name", "email"]);
  const parsed = setupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  const passwordHash = await hashPassword(parsed.data.password);
  const userId = await db.transaction(async (tx) => {
    // Serialize concurrent setup attempts so only one admin can be created.
    await tx.execute(sql`select pg_advisory_xact_lock(7241)`);
    const [{ total }] = await tx.select({ total: count() }).from(schema.users);
    if (total > 0) return null;
    const [user] = await tx
      .insert(schema.users)
      .values({ name: parsed.data.name, email: parsed.data.email, passwordHash, role: "admin" })
      .returning({ id: schema.users.id });
    return user.id;
  });
  if (!userId) return { error: "Setup sudah selesai. Silakan masuk.", values };

  await createSession(userId);
  await logActivity({ user: { id: userId, name: parsed.data.name }, action: "user.setup", target: { type: "user", id: userId, label: parsed.data.email } });
  redirect("/admin");
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, "Email wajib diisi."),
  password: z.string().min(1, "Password wajib diisi."),
});

/** Only same-site dashboard paths, to avoid open redirects. */
/** Where to go after logging in: a dashboard path, the internal hub, or a docs page (internal articles). Never another site. */
function safeNext(value: FormDataEntryValue | null) {
  const next = typeof value === "string" ? value : "";
  return /^\/(admin|internal|docs)(\/[\w\-/]*)?$/.test(next) ? next : "/admin";
}

export async function loginAction(_: FormState, formData: FormData): Promise<FormState> {
  const values = keepValues(formData, ["email"]);
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  // Failures count per account (the IP can't be trusted without a proxy) and, behind a trusted proxy, per IP too.
  const ip = clientIp(await headers());
  const limits: [key: string, limit: number][] = [[`login:email:${parsed.data.email}`, LOGIN_LIMIT_PER_ACCOUNT]];
  if (ip) limits.push([`login:ip:${ip}`, LOGIN_LIMIT_PER_IP]);
  if (limits.some(([key, limit]) => isRateLimited(key, limit))) {
    return { error: "Terlalu banyak percobaan. Coba lagi dalam 15 menit.", values };
  }

  const [user] = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      role: schema.users.role,
      passwordHash: schema.users.passwordHash,
      totpEnabledAt: schema.users.totpEnabledAt,
    })
    .from(schema.users)
    .where(eq(schema.users.email, parsed.data.email));
  const valid = await verifyPassword(parsed.data.password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !valid) {
    for (const [key] of limits) recordFailure(key);
    // Only failures on real accounts are logged, so guessing emails can't fill the log.
    if (user) await logActivity({ user: null, action: "auth.login_failed", target: { type: "user", id: user.id, label: user.name }, meta: { email: parsed.data.email, ip } });
    return { error: "Email atau password salah.", values };
  }

  const next = safeNext(formData.get("next"));
  if (user.totpEnabledAt) {
    // Password is right; the session waits for the second step.
    await createLoginChallenge(user.id);
    redirect(`/admin/login/verify${next === "/admin" ? "" : `?next=${encodeURIComponent(next)}`}`);
  }

  clearFailures(limits[0][0]);
  await createSession(user.id);
  await logActivity({ user, action: "auth.login", meta: { ip } });
  if (user.role === "admin" && (await getSecuritySettings()).requireAdmin2fa) redirect("/admin/profile?2fa=wajib");
  redirect(next);
}

const verifySchema = z.object({ code: z.string().trim().min(6, "Masukkan kode dari aplikasi autentikator.").max(32) });

/** Second step of a login with 2FA: a TOTP code or a recovery code. */
export async function verifyLoginAction(_: FormState, formData: FormData): Promise<FormState> {
  const challenge = await readLoginChallenge();
  if (!challenge || !challenge.totpEnabledAt) {
    await clearLoginChallenge(challenge?.id);
    return { error: "Waktu masuk habis. Masukkan email dan password lagi.", values: { expired: "1" } };
  }
  const parsed = verifySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const ip = clientIp(await headers());
  const accountKey = `login:email:${challenge.email}`;
  if (isRateLimited(accountKey, LOGIN_LIMIT_PER_ACCOUNT) || (ip && isRateLimited(`login:ip:${ip}`, LOGIN_LIMIT_PER_IP))) {
    await clearLoginChallenge(challenge.id);
    return { error: "Terlalu banyak percobaan. Coba lagi dalam 15 menit.", values: { expired: "1" } };
  }
  if (challenge.attempts >= CHALLENGE_ATTEMPTS) {
    await clearLoginChallenge(challenge.id);
    return { error: "Terlalu banyak kode salah. Masukkan email dan password lagi.", values: { expired: "1" } };
  }

  const method = await checkSecondFactor(challenge, parsed.data.code);
  if (!method) {
    recordFailure(accountKey);
    if (ip) recordFailure(`login:ip:${ip}`);
    const left = await recordChallengeFailure(challenge.id);
    await logActivity({ user: null, action: "auth.2fa_failed", target: { type: "user", id: challenge.userId, label: challenge.name }, meta: { ip } });
    if (left === 0) {
      await clearLoginChallenge(challenge.id);
      return { error: "Terlalu banyak kode salah. Masukkan email dan password lagi.", values: { expired: "1" } };
    }
    return { fieldErrors: { code: `Kode salah atau sudah dipakai. Sisa ${left} percobaan.` } };
  }

  clearFailures(accountKey);
  await clearLoginChallenge(challenge.id);
  await createSession(challenge.userId);
  await logActivity({ user: { id: challenge.userId, name: challenge.name }, action: "auth.login", meta: { ip, method } });
  redirect(safeNext(formData.get("next")));
}

/** "Batal" on the second step: forget the challenge. */
export async function cancelLoginAction() {
  const challenge = await readLoginChallenge();
  await clearLoginChallenge(challenge?.id);
  redirect("/admin/login");
}

export async function logoutAction() {
  const user = await getCurrentUser();
  await destroySession();
  if (user) await logActivity({ user, action: "auth.logout" });
  redirect("/admin/login");
}
