"use server";

import { redirect } from "next/navigation";
import { and, count, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { authorize } from "@/lib/auth/dal";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroyUserSessions } from "@/lib/auth/session";
import { emailSchema, fieldErrors, keepValues, passwordSchema, type FormState } from "@/lib/validation";

const role = z.enum(["admin", "editor"]);
const isId = (id: unknown): id is string => z.uuid().safeParse(id).success;

async function emailTaken(email: string, exceptId?: string) {
  const [row] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(exceptId ? and(eq(schema.users.email, email), ne(schema.users.id, exceptId)) : eq(schema.users.email, email));
  return Boolean(row);
}

const newUserSchema = z.object({
  name: z.string().trim().min(1, "Nama wajib diisi.").max(100),
  email: emailSchema,
  role,
  password: passwordSchema,
});

export async function createUser(_: FormState, formData: FormData): Promise<FormState> {
  const user = await authorize("admin");
  if ("error" in user) return { error: user.error };
  const values = keepValues(formData, ["name", "email", "role"]);
  const parsed = newUserSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  if (await emailTaken(parsed.data.email)) return { fieldErrors: { email: "Email sudah terdaftar." }, values };
  await db.insert(schema.users).values({
    name: parsed.data.name,
    email: parsed.data.email,
    role: parsed.data.role,
    passwordHash: await hashPassword(parsed.data.password),
  });
  return { success: `Akun ${parsed.data.email} dibuat. Berikan password awalnya kepada pengguna tersebut.` };
}

async function adminCount() {
  const [{ total }] = await db.select({ total: count() }).from(schema.users).where(eq(schema.users.role, "admin"));
  return total;
}

export async function changeRole(userId: string, newRole: "admin" | "editor") {
  const user = await authorize("admin");
  if ("error" in user) return { ok: false as const, error: user.error };
  if (!isId(userId) || !role.safeParse(newRole).success) return { ok: false as const, error: "Data tidak valid." };
  if (userId === user.id && newRole !== "admin") {
    return { ok: false as const, error: "Anda tidak bisa menurunkan peran akun sendiri." };
  }
  await db.update(schema.users).set({ role: newRole }).where(eq(schema.users.id, userId));
  return { ok: true as const };
}

export async function resetPassword(userId: string, password: string) {
  const user = await authorize("admin");
  if ("error" in user) return { ok: false as const, error: user.error };
  if (!isId(userId)) return { ok: false as const, error: "Pengguna tidak ditemukan." };
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };
  await db.update(schema.users).set({ passwordHash: await hashPassword(parsed.data) }).where(eq(schema.users.id, userId));
  // Sign the user out everywhere with the old password.
  await destroyUserSessions(userId);
  if (userId === user.id) await createSession(user.id);
  return { ok: true as const };
}

export async function deleteUser(userId: string) {
  const user = await authorize("admin");
  if ("error" in user) return { ok: false as const, error: user.error };
  if (!isId(userId)) return { ok: false as const, error: "Pengguna tidak ditemukan." };
  if (userId === user.id) return { ok: false as const, error: "Anda tidak bisa menghapus akun sendiri." };
  const [target] = await db.select({ role: schema.users.role }).from(schema.users).where(eq(schema.users.id, userId));
  if (!target) return { ok: false as const, error: "Pengguna tidak ditemukan." };
  if (target.role === "admin" && (await adminCount()) <= 1) {
    return { ok: false as const, error: "Harus ada minimal satu admin." };
  }
  await db.delete(schema.users).where(eq(schema.users.id, userId));
  return { ok: true as const };
}

// ---- Own profile ----

const profileSchema = z.object({
  name: z.string().trim().min(1, "Nama wajib diisi.").max(100),
  email: emailSchema,
});

export async function updateProfile(_: FormState, formData: FormData): Promise<FormState> {
  const user = await authorize();
  if ("error" in user) redirect("/admin/login");
  const values = keepValues(formData, ["name", "email"]);
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  if (await emailTaken(parsed.data.email, user.id)) return { fieldErrors: { email: "Email sudah dipakai akun lain." }, values };
  await db.update(schema.users).set(parsed.data).where(eq(schema.users.id, user.id));
  return { success: "Profil disimpan.", values: parsed.data };
}

const passwordChangeSchema = z
  .object({ current: z.string().min(1, "Masukkan password saat ini."), password: passwordSchema, confirm: z.string() })
  .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "Password tidak sama." });

export async function changeOwnPassword(_: FormState, formData: FormData): Promise<FormState> {
  const user = await authorize();
  if ("error" in user) redirect("/admin/login");
  const parsed = passwordChangeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const [row] = await db.select({ hash: schema.users.passwordHash }).from(schema.users).where(eq(schema.users.id, user.id));
  if (!row || !(await verifyPassword(parsed.data.current, row.hash))) {
    return { fieldErrors: { current: "Password saat ini salah." } };
  }
  await db.update(schema.users).set({ passwordHash: await hashPassword(parsed.data.password) }).where(eq(schema.users.id, user.id));
  // Other devices are signed out; this one gets a fresh session.
  await destroyUserSessions(user.id);
  await createSession(user.id);
  return { success: "Password diganti. Perangkat lain telah dikeluarkan." };
}
