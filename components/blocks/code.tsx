import { highlightCode } from "@/lib/content/highlight";
import { CodeGroupTabs, CopyButton } from "@/components/blocks/code-client";

export type CodeBlockProps = {
  code: string;
  language?: string | null;
  title?: string | null;
  highlight?: number[];
  lineNumbers?: boolean;
};

async function Highlighted({ code, language, highlight, lineNumbers }: CodeBlockProps) {
  const html = await highlightCode(code, language, highlight, lineNumbers);
  return <div className="code-block" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function CodeBlock(props: CodeBlockProps) {
  return (
    <figure className="group relative overflow-hidden rounded-xl border border-line bg-code">
      {props.title && (
        <figcaption className="flex h-10 items-center border-b border-line px-4 pr-12 font-mono text-xs text-fg-muted">
          {props.title}
        </figcaption>
      )}
      <Highlighted {...props} />
      <div className="absolute top-1.5 right-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <CopyButton text={props.code} />
      </div>
    </figure>
  );
}

/** Several code blocks shown as tabs. Each tab is labelled by its title, else its language. */
export function CodeGroup({ blocks }: { blocks: CodeBlockProps[] }) {
  return (
    <CodeGroupTabs
      items={blocks.map((block, i) => ({
        label: block.title || block.language || `Tab ${i + 1}`,
        code: block.code,
        content: <Highlighted {...block} />,
      }))}
    />
  );
}
