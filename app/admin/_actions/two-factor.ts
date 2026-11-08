"use server";

import { updateTag } from "next/cache";
import { eq, sql } from "drizzle-orm";
import QRCode from "qrcode";
import { z } from "zod";
import { db, schema } from "@/db";
import { logActivity } from "@/lib/activity";
import { authorize } from "@/lib/auth/dal";
import { verifyPassword } from "@/lib/auth/password";
import { allow } from "@/lib/auth/rate-limit";
import { hashRecoveryCode, matchTotp, newRecoveryCodes, newTotpSecret, otpauthUri } from "@/lib/auth/totp";
import { checkSecondFactor } from "@/lib/auth/two-factor";
import { canEncrypt, decryptSecret, encryptSecret } from "@/lib/crypto";
import { getSiteSettings } from "@/lib/data/site";

type Fail = { ok: false; error: string };

const SETUP_MINUTES = 15;
const tooMany: Fail = { ok: false, error: "Terlalu banyak percobaan. Coba lagi dalam 15 menit." };

/** Ten attempts per 15 minutes for every 2FA action that checks a code or password. */
const allowAttempt = (userId: string) => allow(`2fa:${userId}`, 10, 15 * 60 * 1000);

/**
 * Step 1 of turning 2FA on: a new secret, its QR code, and a sealed copy the
 * browser sends back with the first code. Nothing is stored until then.
 */
export async function startTwoFactor(): Promise<{ ok: true; secret: string; svg: string; sealed: string } | Fail> {
  const user = await authorize();
  if ("error" in user) return { ok: false, error: user.error };
  if (!canEncrypt()) return { ok: false, error: "ENCRYPTION_KEY belum diatur di server, jadi 2FA belum bisa diaktifkan." };
  const [row] = await db.select({ enabledAt: schema.users.totpEnabledAt }).from(schema.users).where(eq(schema.users.id, user.id));
  if (row?.enabledAt) return { ok: false, error: "Verifikasi dua langkah sudah aktif." };
  const site = await getSiteSettings();
  const secret = newTotpSecret();
  const uri = otpauthUri(secret, user.email, site.name || "Docsku");
  const svg = await QRCode.toString(uri, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  const sealed = encryptSecret(JSON.stringify({ u: user.id, s: secret, t: Date.now() }));
  return { ok: true, secret, svg, sealed };
}

/** Step 2: the first code proves the app is set up; 2FA is saved and the recovery codes are returned once. */
export async function confirmTwoFactor(sealed: string, code: string): Promise<{ ok: true; codes: string[] } | Fail> {
  const user = await authorize();
  if ("error" in user) return { ok: false, error: user.error };
  if (!allowAttempt(user.id)) return tooMany;
  let setup: { u: string; s: string; t: number } | null = null;
  try {
    const plain = typeof sealed === "string" ? decryptSecret(sealed) : null;
    setup = plain ? JSON.parse(plain) : null;
  } catch {
    setup = null;
  }
  if (!setup || setup.u !== user.id || Date.now() - setup.t > SETUP_MINUTES * 60 * 1000) {
    return { ok: false, error: "Kode QR sudah kedaluwarsa. Mulai lagi." };
  }
  if (matchTotp(setup.s, String(code ?? "")) === null) return { ok: false, error: "Kode salah. Periksa jam di ponsel Anda dan coba kode berikutnya." };

  const codes = newRecoveryCodes();
  const updated = await db
    .update(schema.users)
    .set({ totpSecret: encryptSecret(setup.s), totpEnabledAt: sql`now()`, recoveryCodes: codes.map(hashRecoveryCode) })
    .where(sql`${schema.users.id} = ${user.id} and ${schema.users.totpEnabledAt} is null`)
    .returning({ id: schema.users.id });
  if (!updated.length) return { ok: false, error: "Verifikasi dua langkah sudah aktif." };
  await logActivity({ user, action: "auth.2fa_enable", target: { type: "user", id: user.id, label: user.name } });
  return { ok: true, codes };
}

/** Password or a current code (TOTP or recovery). */
async function proveIdentity(userId: string, proof: string) {
  const [row] = await db
    .select({ hash: schema.users.passwordHash, totpSecret: schema.users.totpSecret })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!row || typeof proof !== "string" || !proof.trim()) return false;
  if (await verifyPassword(proof, row.hash)) return true;
  return (await checkSecondFactor({ userId, totpSecret: row.totpSecret }, proof)) !== null;
}

export async function disableTwoFactor(proof: string): Promise<{ ok: true } | Fail> {
  const user = await authorize();
  if ("error" in user) return { ok: false, error: user.error };
  if (!allowAttempt(user.id)) return tooMany;
  if (!(await proveIdentity(user.id, proof))) return { ok: false, error: "Password atau kode salah." };
  await db.update(schema.users).set({ totpSecret: null, totpEnabledAt: null, recoveryCodes: [] }).where(eq(schema.users.id, user.id));
  await logActivity({ user, action: "auth.2fa_disable", target: { type: "user", id: user.id, label: user.name } });
  return { ok: true };
}

export async function regenerateRecoveryCodes(proof: string): Promise<{ ok: true; codes: string[] } | Fail> {
  const user = await authorize();
  if ("error" in user) return { ok: false, error: user.error };
  if (!allowAttempt(user.id)) return tooMany;
  if (!(await proveIdentity(user.id, proof))) return { ok: false, error: "Password atau kode salah." };
  const codes = newRecoveryCodes();
  const updated = await db
    .update(schema.users)
    .set({ recoveryCodes: codes.map(hashRecoveryCode) })
    .where(sql`${schema.users.id} = ${user.id} and ${schema.users.totpEnabledAt} is not null`)
    .returning({ id: schema.users.id });
  if (!updated.length) return { ok: false, error: "Verifikasi dua langkah belum aktif." };
  await logActivity({ user, action: "auth.2fa_codes", target: { type: "user", id: user.id, label: user.name } });
  return { ok: true, codes };
}

/** Admin: turn 2FA off for someone who lost their phone and codes. */
export async function resetUserTwoFactor(userId: string): Promise<{ ok: true } | Fail> {
  const user = await authorize("admin");
  if ("error" in user) return { ok: false, error: user.error };
  if (!z.uuid().safeParse(userId).success) return { ok: false, error: "Pengguna tidak ditemukan." };
  const [target] = await db
    .update(schema.users)
    .set({ totpSecret: null, totpEnabledAt: null, recoveryCodes: [] })
    .where(eq(schema.users.id, userId))
    .returning({ id: schema.users.id, name: schema.users.name });
  if (!target) return { ok: false, error: "Pengguna tidak ditemukan." };
  await logActivity({ user, action: "user.2fa_reset", target: { type: "user", id: target.id, label: target.name } });
  return { ok: true };
}

/** Pengaturan → Keamanan. Turning the requirement on needs 2FA on your own account first. */
export async function saveSecuritySettings(input: { requireAdmin2fa: boolean }): Promise<{ ok: true } | Fail> {
  const user = await authorize("admin");
  if ("error" in user) return { ok: false, error: user.error };
  const parsed = z.object({ requireAdmin2fa: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pengaturan tidak valid." };
  if (parsed.data.requireAdmin2fa) {
    const [row] = await db.select({ enabledAt: schema.users.totpEnabledAt }).from(schema.users).where(eq(schema.users.id, user.id));
    if (!row?.enabledAt) return { ok: false, error: "Aktifkan verifikasi dua langkah di Profil Anda dulu." };
  }
  await db
    .insert(schema.settings)
    .values({ key: "security", value: parsed.data })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: parsed.data } });
  updateTag("settings");
  await logActivity({ user, action: "settings.save", target: { type: "settings", id: "security", label: "Keamanan" }, meta: parsed.data });
  return { ok: true };
}
