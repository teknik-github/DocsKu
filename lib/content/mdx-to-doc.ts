import type { JSONContent } from "@tiptap/core";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";

/**
 * Converts Markdown with MDX component tags (<Tip>, <Steps>, …) into the TipTap
 * JSON stored in the database. Used by the seed script and for content written
 * by the AI agent.
 */

// mdast nodes are loosely typed here; the shapes we read are small.
type MdNode = {
  type: string;
  value?: string;
  depth?: number;
  ordered?: boolean;
  start?: number | null;
  url?: string;
  alt?: string | null;
  title?: string | null;
  lang?: string | null;
  meta?: string | null;
  name?: string | null;
  attributes?: { type: string; name: string; value?: string | { value: string } | null }[];
  children?: MdNode[];
};
type Mark = NonNullable<JSONContent["marks"]>[number];

const parser = unified().use(remarkParse).use(remarkFrontmatter).use(remarkGfm).use(remarkMdx);
// Plain Markdown, for text that isn't valid MDX (e.g. a stray "<" or "{").
const markdownParser = unified().use(remarkParse).use(remarkFrontmatter).use(remarkGfm);

const CALLOUTS: Record<string, string> = {
  Note: "note",
  Info: "info",
  Tip: "tip",
  Check: "check",
  Warning: "warning",
  Danger: "danger",
};

const PHRASING = new Set([
  "text",
  "strong",
  "emphasis",
  "delete",
  "inlineCode",
  "link",
  "break",
  "image",
  "mdxJsxTextElement",
]);

export function frontmatterOf(source: string): Record<string, string> {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const data: Record<string, string> = {};
  for (const line of match?.[1].split(/\r?\n/) ?? []) {
    const field = line.match(/^(\w+):\s*(.*)$/);
    if (field) data[field[1]] = field[2].trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  return data;
}

const BLOCK_TAGS = new Set([
  ...Object.keys(CALLOUTS),
  "CardGroup",
  "Card",
  "Steps",
  "Step",
  "Tabs",
  "Tab",
  "CodeGroup",
  "Accordion",
]);

/**
 * `<Note>Teks</Note>` on one line parses as a paragraph holding an inline JSX
 * element. Turn such paragraphs back into block elements.
 */
function normalize(node: MdNode): MdNode {
  const children = node.children?.flatMap((child): MdNode[] => {
    const meaningful = (child.children ?? []).filter(
      (c) => !(c.type === "text" && !(c.value ?? "").trim()),
    );
    if (
      child.type === "paragraph" &&
      meaningful.length > 0 &&
      meaningful.every((c) => c.type === "mdxJsxTextElement" && BLOCK_TAGS.has(c.name ?? ""))
    ) {
      return meaningful.map((c) => normalize({ ...c, type: "mdxJsxFlowElement" }));
    }
    return [normalize(child)];
  });
  return children ? { ...node, children } : node;
}

export function mdxToDoc(source: string): JSONContent {
  let parsed: MdNode;
  try {
    parsed = parser.parse(source) as MdNode;
  } catch {
    parsed = markdownParser.parse(source) as MdNode;
  }
  const tree = normalize(parsed);
  const content = flow(tree.children);
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

function attrOf(node: MdNode, name: string): string | undefined {
  const found = node.attributes?.find((a) => a.type === "mdxJsxAttribute" && a.name === name);
  if (!found || found.value == null) return undefined;
  return typeof found.value === "string" ? found.value : found.value.value;
}

function plainText(node: MdNode): string {
  if (node.value !== undefined && node.type !== "code") return node.value;
  return (node.children ?? []).map(plainText).join("");
}

/** Block children; stray inline nodes are gathered into paragraphs. */
function flow(nodes: MdNode[] | undefined): JSONContent[] {
  const out: JSONContent[] = [];
  let pending: MdNode[] = [];
  const flush = () => {
    if (pending.length) out.push(...paragraph(pending));
    pending = [];
  };
  for (const node of nodes ?? []) {
    if (PHRASING.has(node.type)) {
      pending.push(node);
      continue;
    }
    flush();
    out.push(...block(node));
  }
  flush();
  return out;
}

const blockContent = (nodes: MdNode[] | undefined) => {
  const content = flow(nodes);
  return content.length ? content : [{ type: "paragraph" }];
};

function paragraph(children: MdNode[]): JSONContent[] {
  // Images are blocks in the editor, so lift them out of paragraphs.
  const out: JSONContent[] = [];
  let run: MdNode[] = [];
  const flush = () => {
    const content = inline(run, []);
    if (content.some((n) => n.type !== "text" || (n.text ?? "").trim())) {
      out.push({ type: "paragraph", content });
    }
    run = [];
  };
  for (const child of children) {
    if (child.type === "image") {
      flush();
      out.push({ type: "image", attrs: { src: child.url, alt: child.alt ?? "", title: child.title ?? null } });
    } else run.push(child);
  }
  flush();
  return out;
}

function parseCodeMeta(meta: string | null | undefined) {
  const text = meta ?? "";
  return {
    title: text.match(/title="([^"]*)"/)?.[1] ?? null,
    highlight: text.match(/\{([\d,\s-]+)\}/)?.[1].replace(/\s/g, "") ?? null,
    lineNumbers: /\bshowLineNumbers\b/.test(text),
  };
}

function codeBlock(node: MdNode): JSONContent {
  const value = node.value ?? "";
  return {
    type: "codeBlock",
    attrs: { language: node.lang ?? null, ...parseCodeMeta(node.meta) },
    content: value ? [{ type: "text", text: value }] : [],
  };
}

function block(node: MdNode): JSONContent[] {
  switch (node.type) {
    case "yaml":
    case "html":
    case "mdxjsEsm":
    case "mdxFlowExpression":
      return [];
    case "heading":
      return [{ type: "heading", attrs: { level: Math.min(Math.max(node.depth ?? 2, 2), 4) }, content: inline(node.children, []) }];
    case "paragraph":
      return paragraph(node.children ?? []);
    case "list":
      return [
        {
          type: node.ordered ? "orderedList" : "bulletList",
          ...(node.ordered ? { attrs: { start: node.start ?? 1 } } : {}),
          content: (node.children ?? []).map((item) => {
            const content = blockContent(item.children);
            // A list item must start with a paragraph.
            if (content[0]?.type !== "paragraph") content.unshift({ type: "paragraph" });
            return { type: "listItem", content };
          }),
        },
      ];
    case "blockquote":
      return [{ type: "blockquote", content: blockContent(node.children) }];
    case "code":
      return [codeBlock(node)];
    case "thematicBreak":
      return [{ type: "horizontalRule" }];
    case "table":
      return [
        {
          type: "table",
          content: (node.children ?? []).map((row, r) => ({
            type: "tableRow",
            content: (row.children ?? []).map((cell) => ({
              type: r === 0 ? "tableHeader" : "tableCell",
              attrs: { colspan: 1, rowspan: 1, colwidth: null },
              content: [{ type: "paragraph", content: inline(cell.children, []) }],
            })),
          })),
        },
      ];
    case "mdxJsxFlowElement":
      return jsxBlock(node);
    default:
      return node.children ? flow(node.children) : [];
  }
}

function jsxBlock(node: MdNode): JSONContent[] {
  const name = node.name ?? "";
  const children = node.children ?? [];
  if (name in CALLOUTS) {
    return [
      {
        type: "callout",
        attrs: { variant: CALLOUTS[name], title: attrOf(node, "title") ?? null },
        content: blockContent(children),
      },
    ];
  }
  switch (name) {
    case "CardGroup":
      return [
        {
          type: "cardGroup",
          attrs: { cols: Number(attrOf(node, "cols") ?? 2) || 2 },
          content: children.filter((c) => c.name === "Card").flatMap(jsxBlock),
        },
      ];
    case "Card":
      return [
        {
          type: "card",
          attrs: {
            title: attrOf(node, "title") ?? "",
            icon: attrOf(node, "icon") ?? null,
            href: attrOf(node, "href") ?? null,
            description: children.map(plainText).join(" ").trim(),
          },
        },
      ];
    case "Steps":
      return [{ type: "steps", content: children.filter((c) => c.name === "Step").flatMap(jsxBlock) }];
    case "Step":
      return [{ type: "step", attrs: { title: attrOf(node, "title") ?? "" }, content: blockContent(children) }];
    case "Tabs":
      return [{ type: "tabs", content: children.filter((c) => c.name === "Tab").flatMap(jsxBlock) }];
    case "Tab":
      return [{ type: "tab", attrs: { title: attrOf(node, "title") ?? "" }, content: blockContent(children) }];
    case "CodeGroup":
      return [{ type: "codeGroup", content: children.filter((c) => c.type === "code").map(codeBlock) }];
    case "Accordion":
      return [{ type: "accordion", attrs: { title: attrOf(node, "title") ?? "" }, content: blockContent(children) }];
    default:
      return flow(children);
  }
}

function inline(nodes: MdNode[] | undefined, marks: Mark[]): JSONContent[] {
  return (nodes ?? []).flatMap((node): JSONContent[] => {
    const withMarks = (text: string, extra: Mark[] = []): JSONContent => {
      const all = [...marks, ...extra];
      return all.length ? { type: "text", text, marks: all } : { type: "text", text };
    };
    switch (node.type) {
      case "text":
        return node.value ? [withMarks(node.value)] : [];
      case "inlineCode":
        return node.value ? [withMarks(node.value, [{ type: "code" }])] : [];
      case "break":
        return [{ type: "hardBreak" }];
      case "strong":
        return inline(node.children, [...marks, { type: "bold" }]);
      case "emphasis":
        return inline(node.children, [...marks, { type: "italic" }]);
      case "delete":
        return inline(node.children, [...marks, { type: "strike" }]);
      case "link":
        return inline(node.children, [...marks, { type: "link", attrs: { href: node.url } }]);
      case "mdxJsxTextElement":
        // e.g. <kbd>Ctrl</kbd> becomes inline code.
        return node.name === "kbd"
          ? [withMarks(plainText(node), [{ type: "code" }])]
          : inline(node.children, marks);
      default:
        return inline(node.children, marks);
    }
  });
}
