import "server-only";
import type { AiConfig } from "@/lib/ai/config";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type StreamPart = { type: "text" | "reasoning"; text: string };
/** Tokens for one request; `cached` were served from the provider's prompt cache (billed cheaper). */
export type Usage = { input: number; cached: number; output: number };
export type UsagePart = { type: "usage"; usage: Usage };

type RawUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_cache_hit_tokens?: number; // DeepSeek
  prompt_tokens_details?: { cached_tokens?: number }; // OpenAI and compatibles
};

function normalizeUsage(raw: RawUsage): Usage {
  return {
    input: raw.prompt_tokens ?? 0,
    cached: raw.prompt_cache_hit_tokens ?? raw.prompt_tokens_details?.cached_tokens ?? 0,
    output: raw.completion_tokens ?? 0,
  };
}

export const addUsage = (a: Usage, b: Usage): Usage => ({ input: a.input + b.input, cached: a.cached + b.cached, output: a.output + b.output });

export class AiError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}

const endpoint = (config: AiConfig, path: string) => `${config.baseUrl.replace(/\/+$/, "")}${path}`;

function headers(config: AiConfig) {
  const h: Record<string, string> = { "content-type": "application/json" };
  if (config.apiKey) h.authorization = `Bearer ${config.apiKey}`;
  return h;
}

/** Turns a provider error response into a short message for the editor. */
async function describeError(res: Response) {
  const body = await res.text().catch(() => "");
  let detail = "";
  try {
    const json = JSON.parse(body);
    detail = json.error?.message ?? json.message ?? "";
  } catch {
    detail = body.slice(0, 200);
  }
  const hint =
    res.status === 401 ? "API key tidak valid." :
    res.status === 402 ? "Saldo akun AI habis." :
    res.status === 429 ? "Terlalu banyak permintaan ke penyedia AI. Coba lagi sebentar lagi." :
    res.status === 404 ? "Model atau alamat API tidak ditemukan." :
    `Penyedia AI mengembalikan error ${res.status}.`;
  return new AiError(detail ? `${hint} (${detail})` : hint, res.status === 401 ? 401 : 502);
}

type Delta = {
  content?: string | null;
  reasoning_content?: string | null;
  tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[];
  /** From the choice, not the delta: "length" means max_tokens cut the answer off. */
  finish_reason?: string | null;
};

/** Posts a streaming chat request and yields each SSE delta, plus token usage at the end. */
async function* streamDeltas(config: AiConfig, body: Record<string, unknown>, signal?: AbortSignal): AsyncGenerator<Delta | { usage: Usage }> {
  // DeepSeek thinks by default; writing help is faster without it.
  if (config.provider === "deepseek") body.thinking = { type: config.thinking ? "enabled" : "disabled" };
  // Ask for token usage (incl. prompt-cache hits); unknown "custom" servers may reject the option.
  if (config.provider !== "custom") body.stream_options = { include_usage: true };

  let res: Response;
  try {
    res = await fetch(endpoint(config, "/chat/completions"), {
      method: "POST",
      headers: headers(config),
      body: JSON.stringify({ ...body, stream: true }),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) return;
    throw new AiError(`Tidak bisa terhubung ke ${config.baseUrl}. (${(error as Error).message})`);
  }
  if (!res.ok || !res.body) throw await describeError(res);

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const data = line.trim();
      if (!data.startsWith("data:")) continue;
      const payload = data.slice(5).trim();
      if (payload === "[DONE]") return;
      let chunk: { choices?: { delta?: Delta; finish_reason?: string | null }[]; usage?: RawUsage | null; error?: { message?: string } };
      try {
        chunk = JSON.parse(payload);
      } catch {
        continue;
      }
      if (chunk.error) throw new AiError(chunk.error.message ?? "Penyedia AI mengirim error.");
      const choice = chunk.choices?.[0];
      if (choice?.delta || choice?.finish_reason) yield { ...choice.delta, finish_reason: choice.finish_reason };
      if (chunk.usage) yield { usage: normalizeUsage(chunk.usage) };
    }
  }
}

/**
 * Streams a chat completion from any OpenAI-compatible API (DeepSeek, OpenAI,
 * OpenRouter, Ollama, …). Yields answer text and, separately, reasoning text.
 */
export async function* streamChat(
  config: AiConfig,
  messages: ChatMessage[],
  { maxTokens, signal }: { maxTokens?: number; signal?: AbortSignal } = {},
): AsyncGenerator<StreamPart | UsagePart> {
  const body = { model: config.model, messages, temperature: config.temperature, max_tokens: maxTokens ?? config.maxTokens };
  for await (const delta of streamDeltas(config, body, signal)) {
    if ("usage" in delta) {
      yield { type: "usage", usage: delta.usage };
      continue;
    }
    if (delta.reasoning_content) yield { type: "reasoning", text: delta.reasoning_content };
    if (delta.content) yield { type: "text", text: delta.content };
  }
}

// ---- Tool calling (agent) ----

export type ToolSpec = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};
export type ToolCall = { id: string; name: string; arguments: string };
export type AgentMessage =
  | ChatMessage
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
      reasoning_content?: string;
    }
  | { role: "tool"; tool_call_id: string; content: string };
export type AgentPart =
  | StreamPart
  | UsagePart
  /** A tool call's arguments so far (accumulated), sent after each piece arrives. */
  | { type: "tool_progress"; index: number; name: string; arguments: string }
  /** `truncated`: the model hit max_tokens, so the last tool call's arguments may be cut off. */
  | { type: "end"; text: string; reasoning: string; toolCalls: ToolCall[]; truncated: boolean };

/** One model turn with tools: streams text, then reports the tool calls it asked for. */
export async function* streamAgentTurn(
  config: AiConfig,
  messages: AgentMessage[],
  tools: ToolSpec[],
  { maxTokens, signal }: { maxTokens?: number; signal?: AbortSignal } = {},
): AsyncGenerator<AgentPart> {
  const body = {
    model: config.model,
    messages,
    tools,
    tool_choice: "auto",
    temperature: config.temperature,
    max_tokens: maxTokens ?? config.maxTokens,
  };
  let text = "";
  let reasoning = "";
  const calls = new Map<number, ToolCall>();
  let truncated = false;
  for await (const delta of streamDeltas(config, body, signal)) {
    if ("usage" in delta) {
      yield { type: "usage", usage: delta.usage };
      continue;
    }
    if (delta.reasoning_content) {
      reasoning += delta.reasoning_content;
      yield { type: "reasoning", text: delta.reasoning_content };
    }
    if (delta.content) {
      text += delta.content;
      yield { type: "text", text: delta.content };
    }
    for (const part of delta.tool_calls ?? []) {
      const call = calls.get(part.index) ?? { id: "", name: "", arguments: "" };
      if (part.id) call.id = part.id;
      if (part.function?.name) call.name += part.function.name;
      if (part.function?.arguments) call.arguments += part.function.arguments;
      calls.set(part.index, call);
      // `index` is the call's position in `toolCalls` below.
      if (part.function?.arguments) yield { type: "tool_progress", index: [...calls.keys()].indexOf(part.index), name: call.name, arguments: call.arguments };
    }
    if (delta.finish_reason === "length") truncated = true;
  }
  const toolCalls = [...calls.values()].map((call, i) => ({ ...call, id: call.id || `call_${i}` }));
  yield { type: "end", text, reasoning, toolCalls, truncated };
}

/** Collects a whole (short) answer, e.g. for the connection test. */
export async function completeChat(config: AiConfig, messages: ChatMessage[], maxTokens = 50, timeoutMs = 30_000) {
  let text = "";
  for await (const part of streamChat(config, messages, { maxTokens, signal: AbortSignal.timeout(timeoutMs) })) {
    if (part.type === "text") text += part.text;
  }
  return text.trim();
}

export async function listModels(config: AiConfig): Promise<string[]> {
  const res = await fetch(endpoint(config, "/models"), { headers: headers(config), signal: AbortSignal.timeout(15_000) }).catch(
    (error: Error) => {
      throw new AiError(`Tidak bisa terhubung ke ${config.baseUrl}. (${error.message})`);
    },
  );
  if (!res.ok) throw await describeError(res);
  const json = (await res.json()) as { data?: { id: string }[] };
  return (json.data ?? []).map((m) => m.id).sort();
}
