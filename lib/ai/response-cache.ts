import "server-only";
import { createHash } from "node:crypto";
import type { AiConfig } from "@/lib/ai/config";
import type { ChatMessage } from "@/lib/ai/client";

/**
 * In-memory cache of finished AI Write answers. Re-running the exact same
 * request (same model, settings, and prompt) is answered instantly and spends
 * no tokens. Per server instance; cleared on restart.
 */

const TTL_MS = 60 * 60 * 1000;
const MAX_ENTRIES = 300;
const entries = new Map<string, { text: string; expires: number }>();

export function cacheKey(config: AiConfig, messages: ChatMessage[], maxTokens?: number) {
  const { provider, baseUrl, model, temperature, thinking } = config;
  return createHash("sha256")
    .update(JSON.stringify({ provider, baseUrl, model, temperature, thinking, maxTokens: maxTokens ?? config.maxTokens, messages }))
    .digest("hex");
}

export function getCached(key: string): string | null {
  const entry = entries.get(key);
  if (!entry) return null;
  if (entry.expires < Date.now()) {
    entries.delete(key);
    return null;
  }
  // Refresh recency so frequently reused answers stay.
  entries.delete(key);
  entries.set(key, entry);
  return entry.text;
}

export function setCached(key: string, text: string) {
  entries.set(key, { text, expires: Date.now() + TTL_MS });
  while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value!);
}
