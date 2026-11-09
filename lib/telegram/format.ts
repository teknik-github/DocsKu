/**
 * Chat Markdown → Telegram HTML (b, i, s, code, pre, a, blockquote), split into
 * messages under Telegram's 4096-character limit without breaking tags.
 * Links to /docs… and /admin… become absolute with the site's address.
 */

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s: string) => esc(s).replace(/"/g, "&quot;");

const LIMIT = 3800;

export function absoluteUrl(href: string, origin: string): string | null {
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith("/") && !href.startsWith("//") && origin) return `${origin}${href}`;
  return null;
}

export function link(href: string, label: string, origin: string) {
  const url = absoluteUrl(href, origin);
  return url ? `<a href="${escAttr(url)}">${esc(label)}</a>` : esc(label);
}

function inline(text: string, origin: string): string {
  return text
    .split(/(`[^`\n]+`)/)
    .map((part, i) => {
      if (i % 2 === 1) return `<code>${esc(part.slice(1, -1))}</code>`;
      // Links first (on the raw text), with placeholders so their labels and URLs aren't touched below.
      const links: string[] = [];
      let out = part.replace(/\[([^\]\n]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, label: string, href: string) => {
        links.push(link(href, label, origin));
        return `\u0000${links.length - 1}\u0000`;
      });
      out = esc(out)
        .replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>")
        .replace(/__([^_\n]+)__/g, "<b>$1</b>")
        .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, "$1<i>$2</i>")
        .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?:;]|$)/g, "$1<i>$2</i>")
        .replace(/~~([^~\n]+)~~/g, "<s>$1</s>");
      return out.replace(/\u0000(\d+)\u0000/g, (_, n: string) => links[Number(n)]);
    })
    .join("");
}

/** Markdown blocks as Telegram HTML, each small enough for one message. */
function blocks(markdown: string, origin: string): string[] {
  const out: string[] = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let paragraph: string[] = [];
  let quote: string[] = [];
  const flushParagraph = () => {
    if (!paragraph.length) return;
    const text = paragraph.join("\n");
    // A huge paragraph is cut at spaces before converting, so no tag is ever split.
    for (let rest = text; rest; ) {
      let cut = rest.length <= LIMIT - 400 ? rest.length : rest.lastIndexOf(" ", LIMIT - 400);
      if (cut <= 0) cut = LIMIT - 400;
      out.push(inline(rest.slice(0, cut), origin));
      rest = rest.slice(cut).trimStart();
    }
    paragraph = [];
  };
  const flushQuote = () => {
    if (!quote.length) return;
    out.push(`<blockquote>${inline(quote.join("\n").slice(0, LIMIT - 100), origin)}</blockquote>`);
    quote = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^\s*(```+|~~~+)\s*([\w+-]*)/);
    if (fence) {
      flushParagraph();
      flushQuote();
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i].trim().startsWith(fence[1]); i++) code.push(lines[i]);
      const lang = fence[2] ? ` class="language-${escAttr(fence[2])}"` : "";
      // Long code goes out in several <pre> blocks.
      let part: string[] = [];
      const push = () => part.length && out.push(`<pre><code${lang}>${esc(part.join("\n"))}</code></pre>`);
      for (const codeLine of code) {
        if (part.join("\n").length + codeLine.length > LIMIT - 200) {
          push();
          part = [];
        }
        part.push(codeLine.slice(0, LIMIT - 200));
      }
      push();
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      flushQuote();
      continue;
    }
    const quoted = line.match(/^\s*>\s?(.*)$/);
    if (quoted) {
      flushParagraph();
      quote.push(quoted[1]);
      continue;
    }
    flushQuote();
    const heading = line.match(/^\s*#{1,6}\s+(.*)$/);
    if (heading) {
      flushParagraph();
      out.push(`<b>${inline(heading[1].replace(/\s*#+\s*$/, ""), origin)}</b>`);
      continue;
    }
    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
      flushParagraph();
      out.push("———");
      continue;
    }
    const bullet = line.match(/^(\s*)[-*+]\s+(.*)$/);
    paragraph.push(bullet ? `${bullet[1]}• ${bullet[2]}` : line);
  }
  flushParagraph();
  flushQuote();
  return out;
}

/** Packs blocks into messages of at most ~3800 characters. */
export function pack(parts: string[]): string[] {
  const messages: string[] = [];
  let current = "";
  for (const part of parts) {
    if (current && current.length + part.length + 2 > LIMIT) {
      messages.push(current);
      current = "";
    }
    current = current ? `${current}\n\n${part}` : part;
  }
  if (current) messages.push(current);
  return messages;
}

export function markdownToTelegram(markdown: string, origin: string): string[] {
  return pack(blocks(markdown, origin));
}

export { excerpt } from "@/lib/text-excerpt";
