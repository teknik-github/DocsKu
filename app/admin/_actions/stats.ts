"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { authorize } from "@/lib/auth/dal";

type Result = { ok: true } | { ok: false; error: string };

const idSchema = z.uuid();

/** Marks reader feedback as handled (or open again). Editors and admins. */
export async function setFeedbackResolved(id: string, resolved: boolean): Promise<Result> {
  const user = await authorize();
  if ("error" in user) return { ok: false, error: user.error };
  if (!idSchema.safeParse(id).success) return { ok: false, error: "Masukan tidak ditemukan." };
  await db.update(schema.pageFeedback).set({ resolved: resolved === true }).where(eq(schema.pageFeedback.id, id));
  return { ok: true };
}

export async function deleteFeedback(id: string): Promise<Result> {
  const user = await authorize();
  if ("error" in user) return { ok: false, error: user.error };
  if (!idSchema.safeParse(id).success) return { ok: false, error: "Masukan tidak ditemukan." };
  await db.delete(schema.pageFeedback).where(eq(schema.pageFeedback.id, id));
  return { ok: true };
}
