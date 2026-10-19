import { Fragment } from "react";
import type { JSONContent } from "@tiptap/core";
import Link from "next/link";
import { Link2 } from "lucide-react";
import { Accordion } from "@/components/blocks/accordion";
import { Callout, type CalloutVariant } from "@/components/blocks/callout";
import { Card, CardGroup } from "@/components/blocks/card";
import { CodeBlock, CodeGroup, type CodeBlockProps } from "@/components/blocks/code";
import { Hero } from "@/components/blocks/hero";
import { Step, Steps } from "@/components/blocks/steps";
import { Tab, Tabs } from "@/components/blocks/tabs";
import { headingIds, isExternalHref, parseLineSpec, safeHref, textOf } from "@/lib/content/doc";

type Context = { nextHeadingId: () => string };

/** Renders a stored TipTap document as the public docs page body. */
export function RenderDoc({ doc }: { doc: JSONContent }) {
  const ids = headingIds(doc);
  let index = 0;
  const ctx: Context = { nextHeadingId: () => ids[index++] ?? `bagian-${index}` };
  return <>{renderChildren(doc.content, ctx)}</>;
}

function renderChildren(nodes: JSONContent[] | undefined, ctx: Context) {
  return (nodes ?? []).map((node, i) => renderNode(node, ctx, i));
}

function codeProps(node: JSONContent): CodeBlockProps {
  return {
    code: textOf(node),
    language: node.attrs?.language,
    title: node.attrs?.title,
    highlight: parseLineSpec(node.attrs?.highlight),
    lineNumbers: Boolean(node.attrs?.lineNumbers),
  };
}

function renderNode(node: JSONContent, ctx: Context, key: number): React.ReactNode {
  const children = () => renderChildren(node.content, ctx);
  const attrs = node.attrs ?? {};

  switch (node.type) {
    case "paragraph":
      return <p key={key}>{children()}</p>;
    case "text":
      return renderText(node, key);
    case "hardBreak":
      return <br key={key} />;
    case "heading": {
      const id = ctx.nextHeadingId();
      const level = Math.min(Math.max(attrs.level ?? 2, 2), 4);
      const Tag = `h${level}` as "h2" | "h3" | "h4";
      return (
        <Tag key={key} id={id} className="group relative">
          {children()}
          <a
            href={`#${id}`}
            aria-label="Tautan ke bagian ini"
            className="ml-2 inline-flex align-middle text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
          >
            <Link2 className="size-4" />
          </a>
        </Tag>
      );
    }
    case "bulletList":
      return <ul key={key}>{children()}</ul>;
    case "orderedList":
      return (
        <ol key={key} start={attrs.start ?? 1}>
          {children()}
        </ol>
      );
    case "listItem":
      return <li key={key}>{children()}</li>;
    case "blockquote":
      return <blockquote key={key}>{children()}</blockquote>;
    case "horizontalRule":
      return <hr key={key} />;
    case "image": {
      const src = safeHref(attrs.src);
      if (!src) return null;
      // eslint-disable-next-line @next/next/no-img-element
      return <img key={key} src={src} alt={attrs.alt ?? ""} title={attrs.title ?? undefined} loading="lazy" />;
    }
    case "table":
      return (
        <table key={key}>
          <tbody>{children()}</tbody>
        </table>
      );
    case "tableRow":
      return <tr key={key}>{children()}</tr>;
    case "tableHeader":
    case "tableCell": {
      const Cell = node.type === "tableHeader" ? "th" : "td";
      return (
        <Cell key={key} colSpan={attrs.colspan ?? 1} rowSpan={attrs.rowspan ?? 1}>
          {children()}
        </Cell>
      );
    }
    case "codeBlock":
      return <CodeBlock key={key} {...codeProps(node)} />;
    case "codeGroup":
      return (
        <CodeGroup
          key={key}
          blocks={(node.content ?? []).filter((child) => child.type === "codeBlock").map(codeProps)}
        />
      );
    case "callout":
      return (
        <Callout key={key} variant={attrs.variant as CalloutVariant} title={attrs.title}>
          {children()}
        </Callout>
      );
    case "cardGroup":
      return (
        <CardGroup key={key} cols={attrs.cols ?? 2}>
          {children()}
        </CardGroup>
      );
    case "card":
      return (
        <Card key={key} title={attrs.title ?? ""} icon={attrs.icon || undefined} href={safeHref(attrs.href)}>
          {attrs.description || undefined}
        </Card>
      );
    case "steps":
      return <Steps key={key}>{children()}</Steps>;
    case "step":
      return (
        <Step key={key} title={attrs.title ?? ""}>
          {children()}
        </Step>
      );
    case "tabs":
      return <Tabs key={key}>{children()}</Tabs>;
    case "tab":
      return (
        <Tab key={key} title={attrs.title ?? ""}>
          {children()}
        </Tab>
      );
    case "accordion":
      return (
        <Accordion key={key} title={attrs.title ?? ""}>
          {children()}
        </Accordion>
      );
    case "hero":
      return (
        <Hero
          key={key}
          eyebrow={attrs.eyebrow}
          title={attrs.title}
          subtitle={attrs.subtitle}
          showSearch={attrs.showSearch !== false}
          buttons={Array.isArray(attrs.buttons) ? attrs.buttons : []}
        >
          {node.content?.length ? children() : null}
        </Hero>
      );
    default:
      // Unknown nodes still show their content rather than disappearing.
      return node.content ? <div key={key}>{children()}</div> : null;
  }
}

function renderText(node: JSONContent, key: number): React.ReactNode {
  let element: React.ReactNode = node.text ?? "";
  for (const mark of node.marks ?? []) {
    switch (mark.type) {
      case "bold":
        element = <strong>{element}</strong>;
        break;
      case "italic":
        element = <em>{element}</em>;
        break;
      case "underline":
        element = <u>{element}</u>;
        break;
      case "strike":
        element = <s>{element}</s>;
        break;
      case "code":
        element = <code>{element}</code>;
        break;
      case "link": {
        const href = safeHref(mark.attrs?.href);
        if (!href) break;
        element = isExternalHref(href) ? (
          <a href={href} target="_blank" rel="noreferrer">
            {element}
          </a>
        ) : (
          <Link href={href}>{element}</Link>
        );
        break;
      }
    }
  }
  return <Fragment key={key}>{element}</Fragment>;
}
