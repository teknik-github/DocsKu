import { Marked } from "marked";
import type { AiActionId } from "@/lib/ai/presets";

export type AiRequestBody = {
  action: AiActionId;
  instruction?: string;
  selection?: string;
  inline?: boolean;
  title?: string;
  description?: string;
  document?: string;
  /** Ask for a new answer instead of a cached one. */
  fresh?: boolean;
};

export type TokenUsage = { input: number; cached: number; output: number };

/** "1.234 token masuk (80% dari cache) · 310 keluar" */
export function describeUsage(usage: TokenUsage) {
  const n = (v: number) => v.toLocaleString("id-ID");
  const share = usage.input ? Math.round((usage.cached / usage.input) * 100) : 0;
  return `${n(usage.input)} token masuk${usage.cached ? ` (${share}% dari cache)` : ""} · ${n(usage.output)} keluar`;
}

/**
 * Calls /admin/api/ai and reports text as it streams in. Resolves with the
 * full answer; throws with a readable message on failure.
 */
export async function streamAi(
  body: AiRequestBody,
  {
    signal,
    onText,
    onThinking,
    onUsage,
    onCached,
  }: {
    signal?: AbortSignal;
    onText: (all: string) => void;
    onThinking?: () => void;
    onUsage?: (usage: TokenUsage) => void;
    /** The answer came from the server's answer cache; no tokens were used. */
    onCached?: () => void;
  },
): Promise<string> {
  const res = await fetch("/admin/api/ai", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Permintaan AI gagal (${res.status}).`);
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let text = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as { t: "text" | "thinking" | "error" | "usage" | "cached"; v?: string; usage?: TokenUsage };
      if (event.t === "error") throw new Error(event.v);
      if (event.t === "thinking") onThinking?.();
      if (event.t === "usage" && event.usage) onUsage?.(event.usage);
      if (event.t === "cached") onCached?.();
      if (event.t === "text" && event.v) {
        text += event.v;
        onText(text);
      }
    }
  }
  return text;
}

// Raw HTML in the model's answer is shown as text, never parsed as markup.
const markdown = new Marked({
  gfm: true,
  renderer: {
    html: ({ text }) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
  },
});

/** Removes a ```markdown fence some models wrap their whole answer in. */
function unwrap(md: string) {
  const match = md.trim().match(/^```(?:markdown|md)?\n([\s\S]*?)\n```$/);
  return match ? match[1] : md.trim();
}

/** Markdown to HTML for TipTap's insertContent. `inline` keeps it inside the current paragraph. */
export function markdownToHtml(md: string, inline = false): string {
  const source = unwrap(md);
  return inline ? (markdown.parseInline(source.replace(/\s*\n+\s*/g, " ")) as string) : (markdown.parse(source) as string);
}

/** Reads a newline-delimited JSON response, calling `onEvent` for each line. */
export async function readNdjson<T>(res: Response, onEvent: (event: T) => void) {
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Permintaan AI gagal (${res.status}).`);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) if (line.trim()) onEvent(JSON.parse(line) as T);
  }
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const safeUrl = (href: string) => (/^(https?:\/\/|mailto:|\/(?!\/)|#)/i.test(href.trim()) ? href.trim() : null);

// Chat replies: Markdown with raw HTML escaped and only safe link targets.
const chatMarkdown = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    html: ({ text }) => escapeHtml(text),
    link({ href, tokens }) {
      const label = this.parser.parseInline(tokens);
      const url = safeUrl(href);
      if (!url) return label;
      const external = /^https?:\/\//i.test(url);
      return `<a href="${escapeHtml(url)}"${external ? ' target="_blank" rel="noreferrer"' : ""}>${label}</a>`;
    },
    image: ({ href, text }) => {
      const url = safeUrl(href);
      return url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(text || "gambar")}</a>` : escapeHtml(text);
    },
  },
});

export function renderChatMarkdown(md: string): string {
  return chatMarkdown.parse(md) as string;
}
