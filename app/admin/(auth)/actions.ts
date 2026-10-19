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
  redirect("/admin");
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, "Email wajib diisi."),
  password: z.string().min(1, "Password wajib diisi."),
});

/** Only same-site dashboard paths, to avoid open redirects. */
function safeNext(value: FormDataEntryValue | null) {
  const next = typeof value === "string" ? value : "";
  return /^\/admin(\/[\w\-/]*)?$/.test(next) ? next : "/admin";
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
    .select({ id: schema.users.id, passwordHash: schema.users.passwordHash })
    .from(schema.users)
    .where(eq(schema.users.email, parsed.data.email));
  const valid = await verifyPassword(parsed.data.password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !valid) {
    for (const [key] of limits) recordFailure(key);
    return { error: "Email atau password salah.", values };
  }

  clearFailures(limits[0][0]);
  await createSession(user.id);
  redirect(safeNext(formData.get("next")));
}

export async function logoutAction() {
  await destroySession();
  redirect("/admin/login");
}
