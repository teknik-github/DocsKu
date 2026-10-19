/** AI providers with OpenAI-compatible chat APIs. Safe to import from client code. */

export type AiProvider = "deepseek" | "openai" | "openrouter" | "ollama" | "custom";

export const AI_PRESETS: Record<
  AiProvider,
  { label: string; baseUrl: string; models: string[]; needsKey: boolean }
> = {
  deepseek: {
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    models: ["deepseek-flash", "deepseek-v4-pro"],
    needsKey: true,
  },
  openai: { label: "OpenAI", baseUrl: "https://api.openai.com/v1", models: [], needsKey: true },
  openrouter: { label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", models: [], needsKey: true },
  ollama: { label: "Ollama (lokal)", baseUrl: "http://127.0.0.1:11434/v1", models: [], needsKey: false },
  custom: { label: "Lainnya (kompatibel OpenAI)", baseUrl: "", models: [], needsKey: false },
};

/** What the dashboard may see; never includes the key itself. */
export type AiSettingsView = {
  enabled: boolean;
  provider: AiProvider;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  /** DeepSeek only: think before answering (slower, more thorough). */
  thinking: boolean;
  hasKey: boolean;
  keyHint: string | null;
  keyFromEnv: boolean;
};

/** Actions offered on selected text in the editor. */
export const AI_ACTIONS = [
  { id: "improve", label: "Perbaiki tulisan" },
  { id: "grammar", label: "Perbaiki ejaan & tata bahasa" },
  { id: "shorter", label: "Ringkas" },
  { id: "longer", label: "Panjangkan" },
  { id: "simplify", label: "Sederhanakan bahasa" },
  { id: "formal", label: "Nada lebih formal" },
  { id: "casual", label: "Nada lebih santai" },
  { id: "translate-en", label: "Terjemahkan ke Inggris" },
  { id: "translate-id", label: "Terjemahkan ke Indonesia" },
] as const;

export type AiActionId = (typeof AI_ACTIONS)[number]["id"] | "write" | "custom" | "description";
