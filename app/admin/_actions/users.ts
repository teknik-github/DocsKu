"use server";

import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { forgetRouteExistence } from "@/lib/route-exists";
import { and, count, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { authorize } from "@/lib/auth/dal";
import { logActivity } from "@/lib/activity";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroyUserSessions } from "@/lib/auth/session";
import { emailSchema, fieldErrors, keepValues, passwordSchema, type FormState } from "@/lib/validation";

const role = z.enum(["admin", "editor", "contributor"]);
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
  const [created] = await db
    .insert(schema.users)
    .values({
      name: parsed.data.name,
      email: parsed.data.email,
      role: parsed.data.role,
      passwordHash: await hashPassword(parsed.data.password),
    })
    .returning({ id: schema.users.id });
  await logActivity({ user, action: "user.create", target: { type: "user", id: created.id, label: parsed.data.name }, meta: { email: parsed.data.email, role: parsed.data.role } });
  return { success: `Akun ${parsed.data.email} dibuat. Berikan password awalnya kepada pengguna tersebut.` };
}

async function adminCount() {
  const [{ total }] = await db.select({ total: count() }).from(schema.users).where(eq(schema.users.role, "admin"));
  return total;
}

export async function changeRole(userId: string, newRole: "admin" | "editor" | "contributor") {
  const user = await authorize("admin");
  if ("error" in user) return { ok: false as const, error: user.error };
  if (!isId(userId) || !role.safeParse(newRole).success) return { ok: false as const, error: "Data tidak valid." };
  if (userId === user.id && newRole !== "admin") {
    return { ok: false as const, error: "Anda tidak bisa menurunkan peran akun sendiri." };
  }
  const [before] = await db.select({ role: schema.users.role, name: schema.users.name }).from(schema.users).where(eq(schema.users.id, userId));
  if (!before) return { ok: false as const, error: "Pengguna tidak ditemukan." };
  await db.update(schema.users).set({ role: newRole }).where(eq(schema.users.id, userId));
  if (before.role !== newRole) await logActivity({ user, action: "user.role", target: { type: "user", id: userId, label: before.name }, meta: { from: before.role, to: newRole } });
  return { ok: true as const };
}

export async function resetPassword(userId: string, password: string) {
  const user = await authorize("admin");
  if ("error" in user) return { ok: false as const, error: user.error };
  if (!isId(userId)) return { ok: false as const, error: "Pengguna tidak ditemukan." };
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };
  const [target] = await db
    .update(schema.users)
    .set({ passwordHash: await hashPassword(parsed.data) })
    .where(eq(schema.users.id, userId))
    .returning({ name: schema.users.name });
  if (!target) return { ok: false as const, error: "Pengguna tidak ditemukan." };
  await logActivity({ user, action: "user.password_reset", target: { type: "user", id: userId, label: target.name } });
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
  const [target] = await db.select({ role: schema.users.role, name: schema.users.name, email: schema.users.email }).from(schema.users).where(eq(schema.users.id, userId));
  if (!target) return { ok: false as const, error: "Pengguna tidak ditemukan." };
  if (target.role === "admin" && (await adminCount()) <= 1) {
    return { ok: false as const, error: "Harus ada minimal satu admin." };
  }
  await db.delete(schema.users).where(eq(schema.users.id, userId));
  // Their articles fall back to the last editor as author; their /penulis page goes away.
  updateTag("pages");
  updateTag("authors");
  forgetRouteExistence();
  await logActivity({ user, action: "user.delete", target: { type: "user", id: userId, label: target.name }, meta: { email: target.email, role: target.role } });
  return { ok: true as const };
}

// ---- Own profile ----

const passwordChangeSchema = z
  .object({ current: z.string().min(1, "Masukkan password saat ini."), password: passwordSchema, confirm: z.string() })
  .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "Password tidak sama." });

export async function changeOwnPassword(_: FormState, formData: FormData): Promise<FormState> {
  const user = await authorize("any");
  if ("error" in user) redirect("/admin/login");
  const parsed = passwordChangeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const [row] = await db.select({ hash: schema.users.passwordHash }).from(schema.users).where(eq(schema.users.id, user.id));
  if (!row || !(await verifyPassword(parsed.data.current, row.hash))) {
    return { fieldErrors: { current: "Password saat ini salah." } };
  }
  await db.update(schema.users).set({ passwordHash: await hashPassword(parsed.data.password) }).where(eq(schema.users.id, user.id));
  await logActivity({ user, action: "user.password", target: { type: "user", id: user.id, label: user.name } });
  // Other devices are signed out; this one gets a fresh session.
  await destroyUserSessions(user.id);
  await createSession(user.id);
  return { success: "Password diganti. Perangkat lain telah dikeluarkan." };
}
