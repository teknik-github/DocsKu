/**
 * Some models (seen with DeepSeek) occasionally write the rest of a tool call
 * into a string argument, e.g. a page's `content` ending in
 * `</content> <parameter=seo> {"title": …}`. Left in, that text breaks the MDX
 * and the page loses its components. `repairToolArgs` cuts such leftovers out of
 * `content` and recovers the arguments they carried when the real ones are missing.
 */

const LEAK = /<\/(?:content|parameter|invoke|function_calls|tool_call)>|<parameter(?:=|\s+name=)["']?[\w-]+["']?>|<\/?(?:invoke|function_calls|tool_call)\b[^>]*>/;

/** Index where leaked tool syntax starts (outside code fences), or -1. */
export function leakIndex(text: string): number {
  let offset = 0;
  let fence: string | null = null;
  for (const line of text.split("\n")) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/)?.[1];
    if (marker) fence = fence ? (marker[0] === fence[0] && marker.length >= fence.length ? null : fence) : marker;
    else if (!fence) {
      const found = line.match(LEAK);
      if (found?.index !== undefined) return offset + found.index;
    }
    offset += line.length + 1;
  }
  return -1;
}

/** `<parameter=name>value` pieces of a leaked tail. */
function leakedParams(tail: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /<parameter(?:=|\s+name=)["']?([\w-]+)["']?>([\s\S]*?)(?=<parameter(?:=|\s+name=)|<\/parameter>|<\/invoke>|<\/function_calls>|$)/g;
  for (const match of tail.matchAll(re)) out[match[1]] = match[2].trim();
  return out;
}

export function repairToolArgs(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const args = input as Record<string, unknown>;
  if (typeof args.content !== "string") return args;
  const at = leakIndex(args.content);
  if (at < 0) return args;
  const fixed: Record<string, unknown> = { ...args, content: args.content.slice(0, at).trimEnd() };
  for (const [name, value] of Object.entries(leakedParams(args.content.slice(at)))) {
    if (name === "content" || fixed[name] !== undefined || !value) continue;
    if (name === "seo") {
      try {
        const seo = JSON.parse(value) as unknown;
        if (seo && typeof seo === "object") fixed.seo = seo;
      } catch {
        // Not JSON: dropped.
      }
    } else {
      fixed[name] = value;
    }
  }
  return fixed;
}
