import type { JSONContent } from "@tiptap/core";
import { textOf } from "@/lib/content/doc";

/**
 * Serializes a stored document to Markdown, with custom blocks written as
 * MDX-style tags. Used by "Salin halaman" (and handy for exports or AI input).
 */
export function toMarkdown(doc: JSONContent): string {
  return blocks(doc.content).trim() + "\n";
}

const attr = (name: string, value: unknown) =>
  value === undefined || value === null || value === "" ? "" : ` ${name}=${JSON.stringify(String(value))}`;

function blocks(nodes: JSONContent[] | undefined, indent = ""): string {
  return (nodes ?? [])
    .map((node) => block(node, indent))
    .filter((text) => text !== "")
    .join("\n\n");
}

function indentLines(text: string, prefix: string) {
  return text
    .split("\n")
    .map((line) => (line ? prefix + line : line))
    .join("\n");
}

function wrap(tag: string, attrs: string, inner: string) {
  return `<${tag}${attrs}>\n${indentLines(inner, "  ")}\n</${tag}>`;
}

function codeFence(node: JSONContent) {
  const a = node.attrs ?? {};
  const meta = [a.language || "", a.title ? `title=${JSON.stringify(a.title)}` : "", a.highlight ? `{${a.highlight}}` : "", a.lineNumbers ? "showLineNumbers" : ""]
    .filter(Boolean)
    .join(" ");
  const code = textOf(node);
  const fence = code.includes("```") ? "````" : "```";
  return `${fence}${meta}\n${code}\n${fence}`;
}

function block(node: JSONContent, indent: string): string {
  const a = node.attrs ?? {};
  switch (node.type) {
    case "paragraph":
      return inline(node.content);
    case "heading":
      return `${"#".repeat(Math.min(Math.max(a.level ?? 2, 1), 6))} ${inline(node.content)}`;
    case "bulletList":
    case "orderedList":
      return (node.content ?? [])
        .map((item, i) => {
          const marker = node.type === "orderedList" ? `${(a.start ?? 1) + i}.` : "-";
          const body = blocks(item.content);
          return `${marker} ${indentLines(body, " ".repeat(marker.length + 1)).trimStart()}`;
        })
        .join("\n");
    case "blockquote":
      return indentLines(blocks(node.content), "> ");
    case "horizontalRule":
      return "---";
    case "image":
      return `![${a.alt ?? ""}](${a.src ?? ""})`;
    case "codeBlock":
      return codeFence(node);
    case "codeGroup":
      return `<CodeGroup>\n${(node.content ?? []).map(codeFence).join("\n\n")}\n</CodeGroup>`;
    case "table": {
      const rows = (node.content ?? []).map((row) =>
        (row.content ?? []).map((cell) => blocks(cell.content).replace(/\n+/g, " ").replace(/\|/g, "\\|")),
      );
      if (rows.length === 0) return "";
      const header = rows[0];
      return [
        `| ${header.join(" | ")} |`,
        `| ${header.map(() => "---").join(" | ")} |`,
        ...rows.slice(1).map((cells) => `| ${cells.join(" | ")} |`),
      ].join("\n");
    }
    case "callout": {
      const tag = { note: "Note", info: "Info", tip: "Tip", check: "Check", warning: "Warning", danger: "Danger" }[a.variant as string] ?? "Note";
      return wrap(tag, attr("title", a.title), blocks(node.content));
    }
    case "cardGroup":
      return wrap("CardGroup", a.cols ? ` cols={${a.cols}}` : "", blocks(node.content));
    case "card":
      return `<Card${attr("title", a.title)}${attr("icon", a.icon)}${attr("href", a.href)}>${a.description ?? ""}</Card>`;
    case "steps":
      return wrap("Steps", "", blocks(node.content));
    case "step":
      return wrap("Step", attr("title", a.title), blocks(node.content));
    case "tabs":
      return wrap("Tabs", "", blocks(node.content));
    case "tab":
      return wrap("Tab", attr("title", a.title), blocks(node.content));
    case "accordion":
      return wrap("Accordion", attr("title", a.title), blocks(node.content));
    case "hero": {
      const buttons = (Array.isArray(a.buttons) ? a.buttons : [])
        .map((b: { title?: string; href?: string }) => `- [${b.title ?? ""}](${b.href ?? ""})`)
        .join("\n");
      return [a.title ? `# ${String(a.title).replace(/\n/g, " ")}` : "", a.subtitle ?? "", buttons, blocks(node.content)]
        .filter(Boolean)
        .join("\n\n");
    }
    default:
      return blocks(node.content, indent);
  }
}

function inline(nodes: JSONContent[] | undefined): string {
  return (nodes ?? [])
    .map((node) => {
      if (node.type === "hardBreak") return "  \n";
      if (node.type !== "text") return inline(node.content);
      let text = node.text ?? "";
      const marks = node.marks ?? [];
      if (marks.some((m) => m.type === "code")) {
        const tick = text.includes("`") ? "``" : "`";
        text = `${tick}${text}${tick}`;
      }
      for (const mark of marks) {
        if (mark.type === "bold") text = `**${text}**`;
        else if (mark.type === "italic") text = `_${text}_`;
        else if (mark.type === "strike") text = `~~${text}~~`;
        else if (mark.type === "link") text = `[${text}](${mark.attrs?.href ?? ""})`;
      }
      return text;
    })
    .join("");
}
