import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { decryptSecret } from "@/lib/crypto";
import { AI_PRESETS, type AiProvider, type AiSettingsView } from "@/lib/ai/presets";

/** Stored under settings.key = "ai". The key is encrypted; see lib/crypto.ts. */
export type StoredAiSettings = {
  enabled: boolean;
  provider: AiProvider;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  thinking: boolean;
  apiKeyEncrypted?: string;
  apiKeyHint?: string;
};

export const DEFAULT_AI: StoredAiSettings = {
  enabled: false,
  provider: "deepseek",
  baseUrl: AI_PRESETS.deepseek.baseUrl,
  model: "deepseek-flash",
  temperature: 0.7,
  maxTokens: 2000,
  thinking: false,
};

export type AiConfig = StoredAiSettings & { apiKey: string | null };

export async function readStoredAi(): Promise<StoredAiSettings> {
  const [row] = await db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, "ai"));
  return { ...DEFAULT_AI, ...(row?.value as Partial<StoredAiSettings> | undefined) };
}

/** Full config for server-side calls, including the decrypted key. Never send this to the client. */
export async function getAiConfig(): Promise<AiConfig> {
  const stored = await readStoredAi();
  const apiKey = process.env.AI_API_KEY || (stored.apiKeyEncrypted ? decryptSecret(stored.apiKeyEncrypted) : null);
  return { ...stored, apiKey };
}

export function toView(stored: StoredAiSettings): AiSettingsView {
  const { apiKeyEncrypted, apiKeyHint, ...rest } = stored;
  const keyFromEnv = Boolean(process.env.AI_API_KEY);
  return {
    ...rest,
    hasKey: keyFromEnv || Boolean(apiKeyEncrypted),
    keyHint: keyFromEnv ? null : (apiKeyHint ?? null),
    keyFromEnv,
  };
}

/** Whether AI is turned on and has what it needs to make requests. */
export function configReady(config: AiConfig) {
  return config.enabled && Boolean(config.model) && Boolean(config.baseUrl) && (Boolean(config.apiKey) || !AI_PRESETS[config.provider].needsKey);
}

/** Whether the editor should offer AI features. */
export async function isAiReady() {
  return configReady(await getAiConfig());
}
