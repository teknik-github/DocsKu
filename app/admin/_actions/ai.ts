"use server";

import { z } from "zod";
import { db, schema } from "@/db";
import { authorize } from "@/lib/auth/dal";
import { canEncrypt, decryptSecret, encryptSecret } from "@/lib/crypto";
import { readStoredAi, toView, type AiConfig, type StoredAiSettings } from "@/lib/ai/config";
import { AiError, completeChat, listModels } from "@/lib/ai/client";
import type { AiSettingsView } from "@/lib/ai/presets";

const formSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(["deepseek", "openai", "openrouter", "ollama", "custom"]),
  baseUrl: z
    .string()
    .trim()
    .max(300)
    .refine((v) => /^https?:\/\/[^\s]+$/i.test(v), "Alamat API harus diawali http:// atau https://"),
  model: z.string().trim().min(1, "Isi nama model.").max(200),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().int().min(100).max(32_000),
  thinking: z.boolean(),
  /** New key to store; empty keeps the current one. */
  apiKey: z.string().trim().max(500),
  clearKey: z.boolean().optional(),
});
export type AiForm = z.infer<typeof formSchema>;

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** The config to test with: submitted values plus the new or stored key. */
async function draftConfig(input: AiForm): Promise<AiConfig> {
  const stored = await readStoredAi();
  const storedKey = stored.apiKeyEncrypted ? decryptSecret(stored.apiKeyEncrypted) : null;
  const apiKey = input.apiKey || process.env.AI_API_KEY || (input.clearKey ? null : storedKey);
  return { ...stored, ...input, apiKey };
}

export async function saveAiSettings(input: AiForm): Promise<Result<{ view: AiSettingsView }>> {
  const user = await authorize("admin");
  if ("error" in user) return { ok: false, error: user.error };
  const parsed = formSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { apiKey, clearKey, ...settings } = parsed.data;

  const stored = await readStoredAi();
  const next: StoredAiSettings = { ...settings, apiKeyEncrypted: stored.apiKeyEncrypted, apiKeyHint: stored.apiKeyHint };
  if (clearKey) {
    delete next.apiKeyEncrypted;
    delete next.apiKeyHint;
  }
  if (apiKey) {
    if (!canEncrypt()) {
      return { ok: false, error: "ENCRYPTION_KEY belum diatur di .env.local, jadi API key tidak bisa disimpan. Isi AI_API_KEY di .env.local sebagai gantinya." };
    }
    next.apiKeyEncrypted = encryptSecret(apiKey);
    next.apiKeyHint = `…${apiKey.slice(-4)}`;
  }

  await db
    .insert(schema.settings)
    .values({ key: "ai", value: next })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: next } });
  return { ok: true, view: toView(next) };
}

export async function testAiConnection(input: AiForm): Promise<Result<{ reply: string }>> {
  const user = await authorize("admin");
  if ("error" in user) return { ok: false, error: user.error };
  const parsed = formSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  try {
    const reply = await completeChat(await draftConfig(parsed.data), [
      { role: "user", content: "Balas hanya dengan kata: OK" },
    ]);
    return reply ? { ok: true, reply } : { ok: false, error: "Model tidak mengirim jawaban." };
  } catch (error) {
    return { ok: false, error: error instanceof AiError ? error.message : "Tes koneksi gagal." };
  }
}

export async function fetchAiModels(input: AiForm): Promise<Result<{ models: string[] }>> {
  const user = await authorize("admin");
  if ("error" in user) return { ok: false, error: user.error };
  const parsed = formSchema.safeParse({ ...input, model: input.model || "-" });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  try {
    return { ok: true, models: await listModels(await draftConfig(parsed.data)) };
  } catch (error) {
    return { ok: false, error: error instanceof AiError ? error.message : "Gagal memuat daftar model." };
  }
}
