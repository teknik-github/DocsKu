import "server-only";
import type { ReactNode } from "react";
import type { JSONContent } from "@tiptap/core";
import { Document, Image, Link, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { headingIds, textOf } from "@/lib/content/doc";
import { dateLocale, t, type I18nKey } from "@/lib/i18n";
import { MONO, SANS } from "@/lib/pdf/fonts";
import type { PdfImage } from "@/lib/pdf/images";

/**
 * PDF documents drawn with react-pdf from the stored TipTap JSON (the same
 * content the site renders). Every block type has a print form: tabs and code
 * groups show each tab under its label, accordions are open, cards become a
 * list. Links to /docs pages point at the site; `#anchor` links jump inside
 * the PDF. Colours are fixed (light) apart from the site's accent.
 */

export type PdfArticle = {
  title: string;
  description: string;
  content: JSONContent;
  /** Absolute URL of the page on the site. */
  url: string;
  updatedAt: string | null;
  author: { name: string; jobTitle: string | null } | null;
};

export type PdfMeta = {
  siteName: string;
  locale: string;
  accent: string;
  /** Site origin, for absolute links (e.g. "https://docs.example.com"). */
  origin: string;
  images: Map<string, PdfImage>;
};

const INK = "#1f1e1d";
const MUTED = "#6b6964";
const LINE = "#e3e1db";
const FILL = "#f5f4f0";

const CALLOUTS: Record<string, { key: I18nKey; color: string; tint: string }> = {
  note: { key: "calloutNote", color: "#6b6964", tint: "#f3f2ee" },
  info: { key: "calloutInfo", color: "#2563eb", tint: "#eef3fd" },
  tip: { key: "calloutTip", color: "#047857", tint: "#ecf7f2" },
  check: { key: "calloutCheck", color: "#15803d", tint: "#edf8f0" },
  warning: { key: "calloutWarning", color: "#b45309", tint: "#fdf5e8" },
  danger: { key: "calloutDanger", color: "#b91c1c", tint: "#fcefef" },
};

const s = StyleSheet.create({
  // No lineHeight on the page itself: react-pdf then drops `fixed` + `render` elements (the footer). The body View carries it.
  page: { fontFamily: SANS, fontSize: 10.5, color: INK, paddingTop: 48, paddingBottom: 60, paddingHorizontal: 54 },
  body: { lineHeight: 1.55 },
  footer: { fontFamily: SANS, position: "absolute", left: 54, right: 54, bottom: 26, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: MUTED, borderTopWidth: 0.5, borderTopColor: LINE, paddingTop: 6 },
  footerTitle: { maxWidth: "70%" },
  site: { fontSize: 9, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase" },
  title: { fontSize: 22, fontWeight: 700, lineHeight: 1.25, marginTop: 6 },
  description: { fontSize: 12, color: MUTED, marginTop: 6, lineHeight: 1.45 },
  meta: { fontSize: 8.5, color: MUTED, marginTop: 10 },
  rule: { borderBottomWidth: 0.75, borderBottomColor: LINE, marginTop: 14, marginBottom: 14 },
  p: { marginBottom: 7 },
  h1: { fontSize: 18, fontWeight: 700, lineHeight: 1.3, marginTop: 14, marginBottom: 6 },
  h2: { fontSize: 15, fontWeight: 700, lineHeight: 1.3, marginTop: 14, marginBottom: 6 },
  h3: { fontSize: 12.5, fontWeight: 700, lineHeight: 1.35, marginTop: 10, marginBottom: 4 },
  h4: { fontSize: 11, fontWeight: 700, marginTop: 8, marginBottom: 3 },
  listItem: { flexDirection: "row", marginBottom: 3 },
  bullet: { width: 16 },
  grow: { flex: 1 },
  code: { fontFamily: MONO, fontSize: 8.5, lineHeight: 1.5 },
  codeBox: { backgroundColor: FILL, borderWidth: 0.75, borderColor: LINE, borderRadius: 4, marginBottom: 9 },
  codeTitle: { fontFamily: MONO, fontSize: 7.5, color: MUTED, borderBottomWidth: 0.75, borderBottomColor: LINE, paddingHorizontal: 8, paddingVertical: 4 },
  codeBody: { padding: 8 },
  inlineCode: { fontFamily: MONO, fontSize: 9 },
  quote: { borderLeftWidth: 2, borderLeftColor: LINE, paddingLeft: 10, color: MUTED, marginBottom: 8 },
  hr: { borderBottomWidth: 0.75, borderBottomColor: LINE, marginVertical: 10 },
  callout: { borderLeftWidth: 3, borderRadius: 3, paddingVertical: 7, paddingHorizontal: 10, marginBottom: 9 },
  calloutLabel: { fontSize: 9, fontWeight: 700, marginBottom: 3 },
  step: { flexDirection: "row", marginBottom: 8 },
  stepBadge: { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", marginRight: 9, marginTop: 1 },
  stepNumber: { fontFamily: SANS, color: "#ffffff", fontSize: 8.5, fontWeight: 700, lineHeight: 1 },
  stepTitle: { fontWeight: 700, marginBottom: 3, marginTop: 1 },
  tabLabel: { fontSize: 8.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: MUTED, marginBottom: 4, marginTop: 2 },
  box: { borderWidth: 0.75, borderColor: LINE, borderRadius: 4, padding: 9, marginBottom: 9 },
  boxTitle: { fontWeight: 700, marginBottom: 4 },
  table: { borderWidth: 0.75, borderColor: LINE, borderRadius: 3, marginBottom: 10 },
  row: { flexDirection: "row", borderBottomWidth: 0.75, borderBottomColor: LINE },
  cell: { flex: 1, padding: 5, fontSize: 9, borderRightWidth: 0.75, borderRightColor: LINE },
  headCell: { backgroundColor: FILL, fontWeight: 700 },
  image: { maxHeight: 340, objectFit: "contain", marginBottom: 4 },
  caption: { fontSize: 8.5, color: MUTED, textAlign: "center", marginBottom: 9 },
  missingImage: { fontSize: 9, color: MUTED, fontStyle: "italic", marginBottom: 8 },
  card: { marginBottom: 6 },
  cardTitle: { fontWeight: 700 },
  cardText: { color: MUTED, fontSize: 9.5 },
  coverSite: { fontSize: 11, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase" },
  coverTitle: { fontSize: 30, fontWeight: 700, lineHeight: 1.2, marginTop: 10 },
  tocTitle: { fontSize: 13, fontWeight: 700, marginTop: 30, marginBottom: 8 },
  tocRow: { flexDirection: "row", marginBottom: 5, fontSize: 10.5 },
  tocNumber: { width: 26, color: MUTED },
});

/** Glyphs our fonts don't have (emoji) are dropped rather than printed as boxes. */
const clean = (text: string) => text.replace(/\p{Extended_Pictographic}️?|‍/gu, "").replace(/\t/g, "  ");

export function formatPdfDate(iso: string | null, locale: string) {
  if (!iso) return null;
  return new Intl.DateTimeFormat(dateLocale(locale), { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(iso));
}

type Ctx = {
  meta: PdfMeta;
  /** Prefix for anchor ids, so articles in one category PDF don't collide. */
  prefix: string;
  ids: string[];
  heading: number;
  anchors: Set<string>;
  /** Bookmark ## headings in the PDF outline. */
  outline: boolean;
};

function href(raw: unknown, ctx: Ctx): string | null {
  if (typeof raw !== "string" || !raw) return null;
  if (raw.startsWith("#")) {
    const id = raw.slice(1);
    return ctx.anchors.has(id) ? `#${ctx.prefix}${id}` : null;
  }
  if (raw.startsWith("/") && !raw.startsWith("//")) return `${ctx.meta.origin}${raw}`;
  if (/^(https?:|mailto:)/i.test(raw)) return raw;
  return null;
}

function inline(nodes: JSONContent[] | undefined, ctx: Ctx): ReactNode[] {
  return (nodes ?? []).map((node, i) => {
    if (node.type === "hardBreak") return "\n";
    if (node.type !== "text") return <Text key={i}>{inline(node.content, ctx)}</Text>;
    const marks = node.marks ?? [];
    const style: Record<string, string | number> = {};
    let link: string | null = null;
    for (const mark of marks) {
      if (mark.type === "bold") style.fontWeight = 700;
      else if (mark.type === "italic") style.fontStyle = "italic";
      else if (mark.type === "strike") style.textDecoration = "line-through";
      else if (mark.type === "underline") style.textDecoration = "underline";
      else if (mark.type === "code") Object.assign(style, { fontFamily: MONO, fontSize: 9 });
      else if (mark.type === "link") link = href(mark.attrs?.href, ctx);
    }
    // Monospace has no bold italic; keep code upright.
    if (style.fontFamily === MONO) delete style.fontStyle;
    const text = clean(node.text ?? "");
    if (link) {
      return (
        <Link key={i} src={link} style={{ fontFamily: SANS, ...style, color: ctx.meta.accent, textDecoration: "none" }}>
          {text}
        </Link>
      );
    }
    return (
      <Text key={i} style={style}>
        {text}
      </Text>
    );
  });
}

function blocks(nodes: JSONContent[] | undefined, ctx: Ctx): ReactNode[] {
  return (nodes ?? []).map((node, i) => block(node, ctx, i));
}

function codeBlock(node: JSONContent, key: number | string, label?: string | null) {
  const title = label ?? (node.attrs?.title as string | undefined) ?? (node.attrs?.language as string | undefined);
  // Leading spaces are collapsed by the layout engine; non-breaking ones keep the indentation.
  const code = clean(textOf(node))
    .replace(/\n+$/, "")
    .replace(/^ +/gm, (spaces) => "\u00a0".repeat(spaces.length));
  return (
    <View key={key} style={s.codeBox} wrap>
      {title ? <Text style={s.codeTitle}>{title}</Text> : null}
      <View style={s.codeBody}>
        <Text style={s.code}>{code || " "}</Text>
      </View>
    </View>
  );
}

function block(node: JSONContent, ctx: Ctx, key: number): ReactNode {
  const a = node.attrs ?? {};
  switch (node.type) {
    case "paragraph":
      return node.content?.length ? (
        <Text key={key} style={s.p}>
          {inline(node.content, ctx)}
        </Text>
      ) : (
        <View key={key} style={{ height: 6 }} />
      );
    case "heading": {
      const level = Math.min(Math.max(Number(a.level) || 2, 1), 4);
      const id = ctx.ids[ctx.heading++];
      const style = [s.h1, s.h2, s.h3, s.h4][level - 1];
      const text = clean(textOf(node));
      return (
        <Text key={key} id={id ? `${ctx.prefix}${id}` : undefined} style={style} minPresenceAhead={48} {...outline(ctx.outline && level <= 2 ? text : null)}>
          {inline(node.content, ctx)}
        </Text>
      );
    }
    case "bulletList":
    case "orderedList": {
      const start = Number(a.start) || 1;
      return (
        <View key={key} style={{ marginBottom: 6 }}>
          {(node.content ?? []).map((item, i) => (
            <View key={i} style={s.listItem} wrap>
              <Text style={s.bullet}>{node.type === "orderedList" ? `${start + i}.` : "•"}</Text>
              <View style={s.grow}>{blocks(item.content, ctx)}</View>
            </View>
          ))}
        </View>
      );
    }
    case "blockquote":
      return (
        <View key={key} style={s.quote}>
          {blocks(node.content, ctx)}
        </View>
      );
    case "horizontalRule":
      return <View key={key} style={s.hr} />;
    case "codeBlock":
      return codeBlock(node, key);
    case "codeGroup":
      return (
        <View key={key}>
          {(node.content ?? []).map((child, i) => codeBlock(child, i, (child.attrs?.title as string | undefined) || (child.attrs?.language as string | undefined) || null))}
        </View>
      );
    case "image": {
      const src = typeof a.src === "string" ? a.src : "";
      const image = ctx.meta.images.get(src);
      const alt = typeof a.alt === "string" ? clean(a.alt) : "";
      if (!image) return alt ? <Text key={key} style={s.missingImage}>[{alt}]</Text> : null;
      return (
        <View key={key} wrap={false}>
          {/* react-pdf's Image has no alt; the alt text is printed as the caption below. */}
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={image} style={s.image} />
          {alt ? <Text style={s.caption}>{alt}</Text> : <View style={{ height: 6 }} />}
        </View>
      );
    }
    case "table":
      return (
        <View key={key} style={s.table}>
          {(node.content ?? []).map((row, r) => (
            <View key={r} style={s.row} wrap={false}>
              {(row.content ?? []).map((cell, c) => (
                <View key={c} style={cell.type === "tableHeader" ? [s.cell, s.headCell] : s.cell}>
                  {blocks(cell.content, ctx)}
                </View>
              ))}
            </View>
          ))}
        </View>
      );
    case "callout": {
      const look = CALLOUTS[a.variant as string] ?? CALLOUTS.note;
      return (
        <View key={key} style={[s.callout, { borderLeftColor: look.color, backgroundColor: look.tint }]} wrap>
          <Text style={[s.calloutLabel, { color: look.color }]}>{clean((a.title as string) || t(ctx.meta.locale, look.key))}</Text>
          {blocks(node.content, ctx)}
        </View>
      );
    }
    case "steps":
      return (
        <View key={key} style={{ marginBottom: 6 }}>
          {(node.content ?? []).map((step, i) => (
            <View key={i} style={s.step} wrap>
              <View style={[s.stepBadge, { backgroundColor: ctx.meta.accent }]}>
                <Text style={s.stepNumber}>{i + 1}</Text>
              </View>
              <View style={s.grow}>
                {step.attrs?.title ? <Text style={s.stepTitle}>{clean(String(step.attrs.title))}</Text> : null}
                {blocks(step.content, ctx)}
              </View>
            </View>
          ))}
        </View>
      );
    case "step":
      return (
        <View key={key}>
          {a.title ? <Text style={s.stepTitle}>{clean(String(a.title))}</Text> : null}
          {blocks(node.content, ctx)}
        </View>
      );
    case "tabs":
      return (
        <View key={key} style={{ marginBottom: 4 }}>
          {(node.content ?? []).map((tab, i) => (
            <View key={i}>
              <Text style={[s.tabLabel, { borderLeftWidth: 2, borderLeftColor: ctx.meta.accent, paddingLeft: 5 }]} minPresenceAhead={30}>
                {clean(String(tab.attrs?.title ?? ""))}
              </Text>
              {blocks(tab.content, ctx)}
            </View>
          ))}
        </View>
      );
    case "tab":
      return (
        <View key={key}>
          <Text style={s.tabLabel}>{clean(String(a.title ?? ""))}</Text>
          {blocks(node.content, ctx)}
        </View>
      );
    case "accordion":
      return (
        <View key={key} style={s.box} wrap>
          <Text style={s.boxTitle}>{clean(String(a.title ?? ""))}</Text>
          {blocks(node.content, ctx)}
        </View>
      );
    case "cardGroup":
      return (
        <View key={key} style={{ marginBottom: 6 }}>
          {blocks(node.content, ctx)}
        </View>
      );
    case "card": {
      const link = href(a.href, ctx);
      const title = clean(String(a.title ?? ""));
      return (
        <View key={key} style={[s.listItem, s.card]} wrap={false}>
          <Text style={s.bullet}>•</Text>
          <View style={s.grow}>
            {link ? (
              <Link src={link} style={[s.cardTitle, { fontFamily: SANS, color: ctx.meta.accent, textDecoration: "none" }]}>
                {title}
              </Link>
            ) : (
              <Text style={s.cardTitle}>{title}</Text>
            )}
            {a.description ? <Text style={s.cardText}>{clean(String(a.description))}</Text> : null}
            {node.content?.length ? blocks(node.content, ctx) : null}
          </View>
        </View>
      );
    }
    case "embed": {
      // Videos can't play on paper: a link to the video with its caption.
      const url = typeof a.url === "string" && /^https?:\/\//.test(a.url) ? a.url : null;
      if (!url) return null;
      const label = clean(String(a.caption || "Video"));
      return (
        <View key={key} style={[s.box, { marginBottom: 6 }]} wrap={false}>
          <Text style={s.boxTitle}>{label}</Text>
          <Link src={url} style={{ fontFamily: SANS, color: ctx.meta.accent, fontSize: 9 }}>
            {url}
          </Link>
        </View>
      );
    }
    case "mermaid":
      // Diagrams are drawn by the browser; the PDF prints their source under the caption.
      return codeBlock({ type: "codeBlock", attrs: { language: "mermaid" }, content: [{ type: "text", text: String(a.code ?? "") }] }, key, clean(String(a.caption || "Diagram (Mermaid)")));
    case "hero":
      return null;
    default:
      return node.content?.length ? <View key={key}>{blocks(node.content, ctx)}</View> : null;
  }
}

/**
 * An entry in the PDF outline (bookmarks panel). react-pdf supports `bookmark`
 * on any element (nested ones become children), but its types only list it on <Page>.
 */
function outline(title: string | null): object {
  return title ? { bookmark: { title, fit: true } } : {};
}

function newCtx(meta: PdfMeta, doc: JSONContent, prefix: string, outline: boolean): Ctx {
  const ids = headingIds(doc);
  return { meta, prefix, ids, heading: 0, anchors: new Set(ids), outline };
}

function Footer({ meta, title }: { meta: PdfMeta; title: string }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerTitle}>{clean(`${meta.siteName} · ${title}`)}</Text>
      <Text style={{ fontFamily: SANS }} render={({ pageNumber, totalPages }) => t(meta.locale, "pdfPageOf", { n: pageNumber, total: totalPages })} />
    </View>
  );
}

function ArticleHeader({ article, meta }: { article: PdfArticle; meta: PdfMeta }) {
  const date = formatPdfDate(article.updatedAt, meta.locale);
  const by = article.author ? t(meta.locale, "pdfWrittenBy", { name: article.author.name }) + (article.author.jobTitle ? `, ${article.author.jobTitle}` : "") : null;
  return (
    <View>
      <Text style={[s.site, { color: meta.accent }]}>{clean(meta.siteName)}</Text>
      <Text style={s.title}>{clean(article.title)}</Text>
      {article.description ? <Text style={s.description}>{clean(article.description)}</Text> : null}
      <Text style={s.meta}>
        {[by, date ? `${t(meta.locale, "updated")} ${date}` : null].filter(Boolean).join("  ·  ")}
        {"\n"}
        <Link src={article.url} style={{ fontFamily: SANS, color: MUTED, textDecoration: "none" }}>
          {article.url}
        </Link>
      </Text>
      <View style={s.rule} />
    </View>
  );
}

/** One article: title block, content, and a footer with page numbers. */
export function ArticlePdf({ article, meta }: { article: PdfArticle; meta: PdfMeta }) {
  const ctx = newCtx(meta, article.content, "", true);
  return (
    <Document title={article.title} author={article.author?.name ?? meta.siteName} subject={article.description || undefined} creator={meta.siteName} producer="Docsku" language={meta.locale}>
      <Page size="A4" style={s.page}>
        <View style={s.body}>
          <ArticleHeader article={article} meta={meta} />
          {blocks(article.content.content, ctx)}
        </View>
        <Footer meta={meta} title={article.title} />
      </Page>
    </Document>
  );
}

/** A category: cover with the table of contents, then every article on a new page, bookmarked in the outline. */
export function CategoryPdf({ title, group, articles, meta }: { title: string; group: string | null; articles: PdfArticle[]; meta: PdfMeta }) {
  const today = formatPdfDate(new Date().toISOString(), meta.locale);
  return (
    <Document title={title} author={meta.siteName} creator={meta.siteName} producer="Docsku" language={meta.locale}>
      <Page size="A4" style={s.page}>
        <View style={{ marginTop: 120 }}>
          <Text style={[s.coverSite, { color: meta.accent }]}>{clean(meta.siteName)}</Text>
          <Text style={s.coverTitle}>{clean(title)}</Text>
          {group ? <Text style={s.description}>{clean(group)}</Text> : null}
          <Text style={s.meta}>{[t(meta.locale, "pdfArticles", { n: articles.length }), today].filter(Boolean).join("  ·  ")}</Text>
        </View>
        <Text style={s.tocTitle}>{t(meta.locale, "pdfContents")}</Text>
        {articles.map((article, i) => (
          <View key={i} style={s.tocRow} wrap={false}>
            <Text style={s.tocNumber}>{i + 1}.</Text>
            <Link src={`#a${i}`} style={{ fontFamily: SANS, color: INK, textDecoration: "none", flex: 1 }}>
              {clean(article.title)}
            </Link>
          </View>
        ))}
        <Footer meta={meta} title={title} />
      </Page>
      {articles.map((article, i) => {
        const ctx = newCtx(meta, article.content, `a${i}-`, false);
        return (
          <Page key={i} size="A4" style={s.page}>
            <View id={`a${i}`} style={s.body} {...outline(clean(article.title))}>
              <ArticleHeader article={article} meta={meta} />
              {blocks(article.content.content, ctx)}
            </View>
            <Footer meta={meta} title={title} />
          </Page>
        );
      })}
    </Document>
  );
}
