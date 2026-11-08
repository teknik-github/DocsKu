import Link from "next/link";
import { ArrowRight, ChevronDown, Clock, FileText, Star, TrendingUp } from "lucide-react";
import { Icon } from "@/components/icon";
import { SearchField } from "@/components/search";
import { SiteFooter } from "@/components/site-footer";
import { PageCardView } from "@/components/publication/cards";
import { getNavigation, getPageCards, getPopularPages, getSiteSettings, getTranslationAlternates } from "@/lib/data/site";
import { dateLocale, type I18nKey, t } from "@/lib/i18n";
import { allPages, sectionPages } from "@/lib/navigation";
import { categoryIcon } from "@/lib/category-icon";
import { formatDate } from "@/lib/format";
import { fixedImage, responsiveImage } from "@/lib/responsive-image";
import { mdxToDoc } from "@/lib/content/mdx-to-doc";
import { RenderDoc } from "@/lib/content/render";
import { type HomeButton, type HomeSection, type NavLink, type NavTab, type PageCard, type SiteSettings, siteForLocale } from "@/lib/site-types";

/**
 * The public home page: sections built at /admin/home, rendered in order.
 * Consecutive "half" sections share a row. Every section carries
 * data-home-section so the builder's preview can select and scroll to it.
 */

type Data = {
  /** The language of this home: undefined for the default language, else an extra language's code. */
  locale: string | undefined;
  /** Reader chrome in that language. */
  tx: (key: I18nKey, vars?: Record<string, string | number>) => string;
  /** A docs href in this language: the translation when there is one (manual article picks are stored as originals). */
  localize: (href: string) => string;
  site: SiteSettings;
  tabs: NavTab[];
  pages: ReturnType<typeof allPages>;
  byHref: Map<string, ReturnType<typeof allPages>[number]>;
  cards: Map<string, PageCard>;
  popular: string[];
};
type Of<T extends HomeSection["type"]> = Extract<HomeSection, { type: T }>;

async function loadData(locale?: string): Promise<Data> {
  const [site, tabs, cards, popular, alternates] = await Promise.all([
    getSiteSettings(),
    getNavigation(locale),
    getPageCards(locale),
    getPopularPages(24, locale),
    locale ? getTranslationAlternates() : Promise.resolve({}),
  ]);
  const pages = allPages(tabs);
  const localize = (href: string) => (locale ? ((alternates as Record<string, Record<string, string>>)[href]?.[locale] ?? href) : href);
  return {
    locale,
    tx: (key, vars) => t(locale ?? "id", key, vars),
    localize,
    site: siteForLocale(site, locale),
    tabs,
    pages,
    byHref: new Map(pages.map((p) => [p.href, p])),
    cards: new Map(cards.map((c) => [c.href, c])),
    popular,
  };
}

/** "Oct 18, 2026" in an extra language's own format (same time zone as formatDate). */
const localDate = (value: string, locale: string) =>
  new Intl.DateTimeFormat(dateLocale(locale), { day: "numeric", month: "short", year: "numeric", timeZone: process.env.NEXT_PUBLIC_TIME_ZONE || "Asia/Jakarta" }).format(
    new Date(value),
  );

const TONES = { plain: "", muted: "border-y border-line bg-fill/50", accent: "border-y border-line bg-accent-soft/40" };
const GRID = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" };

/** `locale`: an extra language's home (/<code>); its navigation, cards and reader chrome. */
export async function HomeSections({ sections, locale }: { sections: HomeSection[]; locale?: string }) {
  const data = await loadData(locale);
  const visible = sections.filter((s) => !s.hidden);
  // Pair consecutive half-width sections into rows (the hero is always full width).
  const rows: HomeSection[][] = [];
  for (const section of visible) {
    const last = rows.at(-1);
    const half = section.width === "half" && section.type !== "hero";
    if (half && last?.length === 1 && last[0].width === "half" && last[0].type !== "hero") last.push(section);
    else rows.push([section]);
  }

  return (
    <>
      <main className="pb-16">
        {visible.length === 0 && <p className="mx-auto max-w-6xl px-5 py-24 text-center text-fg-muted sm:px-8">{data.tx("homeEmpty")}</p>}
        {rows.map((row) => {
          const [first] = row;
          if (first.type === "hero") return <Hero key={first.id} s={first} data={data} />;
          if (row.length === 1 && first.width === "full") {
            return (
              <section key={first.id} data-home-section={first.id} className={TONES[first.tone]}>
                <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8 lg:py-14">
                  <Body s={first} data={data} />
                </div>
              </section>
            );
          }
          return (
            <div key={row.map((s) => s.id).join("-")} className="mx-auto grid max-w-6xl gap-10 px-5 py-12 sm:px-8 md:grid-cols-2 lg:py-14">
              {row.map((s) => (
                <section key={s.id} data-home-section={s.id} className={`min-w-0 ${s.tone === "plain" ? "" : `rounded-2xl p-6 ${TONES[s.tone]} border-x`}`}>
                  <Body s={s} data={data} />
                </section>
              ))}
            </div>
          );
        })}
      </main>
      <SiteFooter />
    </>
  );
}

function Body({ s, data }: { s: HomeSection; data: Data }) {
  switch (s.type) {
    case "categories":
      return <Categories s={s} data={data} />;
    case "articles":
      return <Articles s={s} data={data} />;
    case "features":
      return <Features s={s} />;
    case "textImage":
      return <TextImage s={s} />;
    case "faq":
      return <Faq s={s} />;
    case "stats":
      return <Stats s={s} />;
    case "cta":
      return <Cta s={s} />;
    case "content":
      return (
        <div className="prose-docs prose-home">
          <RenderDoc doc={mdxToDoc(s.markdown)} />
        </div>
      );
    case "hero":
      return null;
  }
}

// ---- Shared pieces ----

function Title({ children, sub }: { children: React.ReactNode; sub?: string }) {
  if (!children && !sub) return null;
  return (
    <div className="mb-6">
      {children && <h2 className="text-xl font-semibold text-fg sm:text-2xl">{children}</h2>}
      {sub && <p className="mt-1.5 max-w-2xl text-fg-muted">{sub}</p>}
    </div>
  );
}

const external = (href: string) => /^https?:\/\//i.test(href);

function SmartLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  return external(href) ? (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {children}
    </a>
  ) : (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

function Buttons({ buttons, onImage = false, center = false }: { buttons: HomeButton[]; onImage?: boolean; center?: boolean }) {
  if (buttons.length === 0) return null;
  return (
    <div className={`mt-6 flex flex-wrap gap-3 ${center ? "justify-center" : ""}`}>
      {buttons.map((button, i) => (
        <SmartLink
          key={i}
          href={button.href}
          className={`inline-flex h-10 items-center gap-1.5 rounded-lg px-4 text-sm font-medium transition-opacity hover:opacity-90 ${
            button.style === "primary"
              ? onImage
                ? "bg-white text-neutral-900"
                : "bg-fg text-page"
              : onImage
                ? "border border-white/40 text-white"
                : "border border-line bg-surface text-fg"
          }`}
        >
          {button.label}
          {button.style === "primary" && <ArrowRight className="size-4" />}
        </SmartLink>
      ))}
    </div>
  );
}

/** Text with blank lines as paragraph breaks. */
function Paragraphs({ text, className = "" }: { text: string; className?: string }) {
  return (
    <>
      {text
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p, i) => (
          <p key={i} className={`whitespace-pre-line ${i ? "mt-3" : ""} ${className}`}>
            {p}
          </p>
        ))}
    </>
  );
}

/** An uploaded or external image; uploads get resized WebP variants (lib/responsive-image.ts). `fixed` = a small icon of that many px. */
function Picture({ src, className, sizes = "100vw", fixed }: { src: string; className: string; sizes?: string; fixed?: number }) {
  const image = fixed ? fixedImage(src, fixed) : responsiveImage(src, { sizes });
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...image} alt="" loading="lazy" decoding="async" className={className} />;
}

function popularOf(data: Data) {
  const featured = [...data.cards.values()].filter((c) => c.featured).map((c) => c.href);
  return [...data.popular, ...featured, ...data.pages.map((p) => p.href)].filter((href, i, all) => data.byHref.has(href) && all.indexOf(href) === i);
}

// ---- Sections ----

function Hero({ s, data }: { s: Of<"hero">; data: Data }) {
  const photo = s.image;
  const center = s.align === "center";
  const subtitle = s.subtitle || data.site.description;
  const chips = s.showPopular ? popularOf(data).slice(0, 4).map((href) => data.byHref.get(href)!) : [];
  const background =
    s.tone === "accent" ? "radial-gradient(ellipse at top, color-mix(in srgb, var(--accent) 16%, transparent), transparent 70%), var(--page)" : undefined;
  return (
    <section
      data-home-section={s.id}
      className={`border-b border-line ${photo ? "bg-cover bg-center" : s.tone === "muted" ? "bg-fill/50" : ""}`}
      style={{
        background: photo ? undefined : background,
        // A darkened photo keeps the white text readable on any image.
        backgroundImage: photo ? `linear-gradient(rgb(0 0 0 / 0.55), rgb(0 0 0 / 0.45)), url(${JSON.stringify(responsiveImage(photo, { sizes: "100vw" }).src)})` : undefined,
      }}
    >
      <div className={`mx-auto px-5 py-16 sm:px-8 lg:py-24 ${center ? "max-w-3xl text-center" : "max-w-6xl"}`}>
        <div className={center ? "" : "max-w-2xl"}>
          <p className={`text-sm font-medium ${photo ? "text-white/85" : "text-accent"}`}>{s.eyebrow || data.tx("helpCenterOf", { name: data.site.name })}</p>
          <h1 className={`mt-3 font-serif text-4xl font-light tracking-tight text-balance sm:text-5xl ${photo ? "text-white" : "text-fg"}`}>{s.title}</h1>
          {subtitle && <p className={`mt-4 max-w-xl text-lg ${center ? "mx-auto" : ""} ${photo ? "text-white/85" : "text-fg-muted"}`}>{subtitle}</p>}
          {s.showSearch && (
            <SearchField label={s.searchLabel || data.tx("search")} className={`mt-8 h-14 max-w-2xl rounded-xl bg-surface! px-5 text-base shadow-sm ${center ? "mx-auto" : ""}`} />
          )}
          {chips.length > 0 && (
            <div className={`mt-5 flex flex-wrap items-center gap-2 text-sm ${center ? "justify-center" : ""}`}>
              <span className={photo ? "text-white/80" : "text-fg-subtle"}>{data.tx("popularLabel")}</span>
              {chips.map((page) => (
                <Link
                  key={page.href}
                  href={page.href}
                  prefetch={true}
                  className="rounded-full border border-line bg-surface px-3 py-1 text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
                >
                  {page.title}
                </Link>
              ))}
            </div>
          )}
          <Buttons buttons={s.buttons} onImage={Boolean(photo)} center={center} />
        </div>
      </div>
    </section>
  );
}

function CategoryCard({ title, image, links, max, tx }: { title: string; image?: string; links: NavLink[]; max: number; tx: Data["tx"] }) {
  const shown = links.slice(0, max);
  const rest = links.slice(max);
  return (
    <article className="flex flex-col rounded-2xl border border-line bg-surface p-6 transition-colors hover:border-line-strong">
      <div className="flex items-start gap-4">
        {image ? (
          <Picture src={image} fixed={44} className="size-11 shrink-0 rounded-xl border border-line bg-surface object-contain" />
        ) : (
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Icon name={categoryIcon(title)} className="size-5" />
          </span>
        )}
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-fg">
            <Link href={links[0].href} prefetch={true} className="hover:text-accent">
              {title}
            </Link>
          </h3>
          <p className="mt-0.5 text-xs text-fg-subtle">{tx("articles", { n: links.length })}</p>
        </div>
      </div>
      {shown.length > 0 && (
        <ul className="mt-5 border-t border-line pt-3">
          {shown.map((link) => (
            <ArticleLink key={link.href} link={link} />
          ))}
        </ul>
      )}
      {max > 0 && rest.length > 0 && (
        // Native disclosure: the rest of the category opens in place, without JavaScript.
        <details className="group">
          <summary className="mt-2 flex cursor-pointer list-none items-center gap-1 text-sm font-medium text-accent [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">{tx("seeAllArticles", { n: links.length })}</span>
            <span className="hidden group-open:inline">{tx("showLess")}</span>
            <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <ul className="mt-1">
            {rest.map((link) => (
              <ArticleLink key={link.href} link={link} />
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}

function ArticleLink({ link }: { link: NavLink }) {
  return (
    <li>
      <Link href={link.href} prefetch={true} className="group flex items-start gap-2.5 rounded-md py-1.5 text-sm text-fg-muted transition-colors hover:text-fg">
        <FileText className="mt-0.5 size-4 shrink-0 text-fg-subtle transition-colors group-hover:text-accent" aria-hidden />
        <span className="leading-snug">{link.title}</span>
      </Link>
    </li>
  );
}

function Categories({ s, data }: { s: Of<"categories">; data: Data }) {
  if (data.tabs.length === 0) return <p className="rounded-2xl border border-line bg-surface p-8 text-center text-fg-muted">{data.tx("noArticles")}</p>;
  const grid = (tab: NavTab) => (
    <div className={`grid gap-5 ${GRID[s.columns]}`}>
      {tab.sections.map((section) => {
        const links = sectionPages(section);
        return links.length ? <CategoryCard key={section.title} title={section.title} image={section.image} links={links} max={s.links} tx={data.tx} /> : null;
      })}
    </div>
  );
  if (!s.groupByTab || data.tabs.length === 1) {
    return (
      <>
        <Title>{s.title}</Title>
        {grid({ title: "", href: "", sections: data.tabs.flatMap((t) => t.sections) })}
      </>
    );
  }
  return (
    <div className="space-y-12">
      {s.title && <Title>{s.title}</Title>}
      {data.tabs.map((tab) => (
        <div key={tab.title}>
          <div className="mb-5 flex items-end justify-between gap-4">
            <h3 className="text-lg font-semibold text-fg">{tab.title}</h3>
            <Link href={tab.href} prefetch={true} className="flex shrink-0 items-center gap-1 text-sm text-fg-muted hover:text-fg">
              {data.tx("openTab", { name: tab.title })}
              <ArrowRight className="size-4" />
            </Link>
          </div>
          {grid(tab)}
        </div>
      ))}
    </div>
  );
}

const SOURCE_ICON = { popular: TrendingUp, latest: Clock, featured: Star, manual: FileText };

function Articles({ s, data }: { s: Of<"articles">; data: Data }) {
  let hrefs: string[];
  if (s.source === "popular") hrefs = popularOf(data);
  else if (s.source === "latest") {
    hrefs = [...data.cards.values()]
      .filter((c) => c.publishedAt && data.byHref.has(c.href))
      .sort((a, b) => b.publishedAt!.localeCompare(a.publishedAt!))
      .map((c) => c.href);
  } else if (s.source === "featured") hrefs = [...data.cards.values()].filter((c) => c.featured && data.byHref.has(c.href)).map((c) => c.href);
  else hrefs = s.pages.map(data.localize).filter((href) => data.byHref.has(href));
  const items = hrefs.slice(0, s.limit).flatMap((href) => {
    const page = data.byHref.get(href);
    return page ? [{ page, card: data.cards.get(href) }] : [];
  });
  const SourceIcon = SOURCE_ICON[s.source];

  return (
    <>
      {s.title && (
        <h2 className="mb-5 flex items-center gap-2 text-lg font-semibold text-fg">
          <SourceIcon className="size-5 text-accent" aria-hidden />
          {s.title}
        </h2>
      )}
      {items.length === 0 ? (
        <p className="text-sm text-fg-subtle">{data.tx("noArticlesToShow")}</p>
      ) : s.style === "cards" ? (
        <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {items.flatMap(({ page, card }) => (card ? [<PageCardView key={card.href} card={card} tag={page.section} />] : []))}
        </div>
      ) : (
        <ol className="divide-y divide-line">
          {items.map(({ page, card }, i) => (
            <li key={page.href}>
              <Link href={page.href} prefetch={true} className="group flex items-start gap-4 py-3">
                {s.source === "popular" && <span className="w-5 shrink-0 pt-0.5 text-right text-sm font-medium text-fg-subtle tabular-nums">{i + 1}</span>}
                <span className="min-w-0">
                  <span className="block font-medium text-fg group-hover:text-accent">{page.title}</span>
                  <span className="mt-0.5 block text-xs text-fg-subtle">
                    {s.source === "latest" && card?.publishedAt
                      ? `${data.locale ? localDate(card.publishedAt, data.locale) : formatDate(card.publishedAt)} · ${data.tx("minRead", { n: card.readingMinutes })}`
                      : `${page.tab} › ${page.section}`}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function Features({ s }: { s: Of<"features"> }) {
  return (
    <>
      <Title sub={s.subtitle}>{s.title}</Title>
      <div className={`grid gap-5 ${GRID[s.columns]}`}>
        {s.items.map((item, i) => {
          const inner = (
            <>
              {item.image ? (
                <Picture src={item.image} sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="mb-4 aspect-[16/9] w-full rounded-xl border border-line bg-fill object-cover" />
              ) : (
                <span className="mb-4 flex size-11 items-center justify-center rounded-xl bg-accent-soft text-accent">
                  <Icon name={item.icon} className="size-5" />
                </span>
              )}
              <h3 className="font-semibold text-fg group-hover:text-accent">{item.title}</h3>
              {item.text && <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{item.text}</p>}
            </>
          );
          const className = "group block rounded-2xl border border-line bg-surface p-6 transition-colors hover:border-line-strong";
          return item.href ? (
            <SmartLink key={i} href={item.href} className={className}>
              {inner}
            </SmartLink>
          ) : (
            <div key={i} className={className}>
              {inner}
            </div>
          );
        })}
      </div>
    </>
  );
}

function TextImage({ s }: { s: Of<"textImage"> }) {
  const text = (
    <div className="min-w-0 self-center">
      {s.title && <h2 className="font-serif text-3xl font-light tracking-tight text-fg sm:text-4xl">{s.title}</h2>}
      <div className="mt-4 text-fg-muted">
        <Paragraphs text={s.text} className="leading-relaxed" />
      </div>
      <Buttons buttons={s.buttons} />
    </div>
  );
  if (!s.image) return text;
  return (
    <div className="grid items-center gap-10 md:grid-cols-2">
      {s.imageSide === "left" && <Picture src={s.image} sizes="(min-width: 1024px) 50vw, 100vw" className="w-full rounded-2xl border border-line object-cover" />}
      {text}
      {s.imageSide === "right" && <Picture src={s.image} sizes="(min-width: 1024px) 50vw, 100vw" className="w-full rounded-2xl border border-line object-cover" />}
    </div>
  );
}

function Faq({ s }: { s: Of<"faq"> }) {
  return (
    <>
      <Title>{s.title}</Title>
      <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
        {s.items.map((item, i) => (
          <details key={i} className="group px-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium text-fg [&::-webkit-details-marker]:hidden">
              {item.question}
              <ChevronDown className="size-4 shrink-0 text-fg-subtle transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="pb-4 text-sm text-fg-muted">
              <Paragraphs text={item.answer} className="leading-relaxed" />
            </div>
          </details>
        ))}
      </div>
    </>
  );
}

function Stats({ s }: { s: Of<"stats"> }) {
  return (
    <>
      <Title>{s.title}</Title>
      <dl className={`grid gap-6 text-center ${s.items.length >= 4 ? "grid-cols-2 lg:grid-cols-4" : s.items.length === 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-2"}`}>
        {s.items.map((item, i) => (
          <div key={i} className="rounded-2xl border border-line bg-surface px-4 py-6">
            <dt className="sr-only">{item.label}</dt>
            <dd className="font-serif text-3xl font-light tracking-tight text-balance text-fg lg:text-4xl">{item.value}</dd>
            <dd className="mt-1 text-sm text-fg-muted">{item.label}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

function Cta({ s }: { s: Of<"cta"> }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-line bg-surface px-6 py-10 text-center">
      {s.title && <h2 className="text-xl font-semibold text-fg">{s.title}</h2>}
      {s.text && <p className="mt-3 max-w-md text-fg-muted">{s.text}</p>}
      <Buttons buttons={s.buttons} center />
    </div>
  );
}
