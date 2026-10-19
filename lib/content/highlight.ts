import { cacheLife } from "next/cache";
import { bundledLanguages, codeToHtml } from "shiki";

const PLAIN = new Set(["text", "plaintext", "txt", "plain"]);

export function normalizeLanguage(language: string | null | undefined) {
  const lang = (language ?? "").toLowerCase().trim();
  return lang in bundledLanguages || PLAIN.has(lang) ? lang : "text";
}

/**
 * Syntax-highlights code with both light and dark themes. Output is generated
 * by Shiki from escaped source, so it is safe to inject as HTML.
 */
export async function highlightCode(
  code: string,
  language: string | null | undefined,
  highlightLines: number[] = [],
  lineNumbers = false,
): Promise<string> {
  "use cache";
  cacheLife("max");
  const highlighted = new Set(highlightLines);
  return codeToHtml(code.replace(/\n$/, ""), {
    lang: normalizeLanguage(language),
    themes: { light: "github-light", dark: "github-dark-dimmed" },
    defaultColor: false,
    transformers: [
      {
        pre(node) {
          delete node.properties.tabindex;
          delete node.properties.style;
        },
        code(node) {
          if (lineNumbers) node.properties["data-line-numbers"] = "";
        },
        line(node, line) {
          if (highlighted.has(line)) this.addClassToHast(node, "highlighted");
        },
      },
    ],
  });
}
