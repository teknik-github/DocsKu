import Link from "next/link";
import { Icon } from "@/components/icon";
import { SearchField } from "@/components/search";
import { isExternalHref, safeHref } from "@/lib/content/doc";

type HeroButton = { title?: string; href?: string; icon?: string | null };

/** The big intro block at the top of the home page. `children` is an optional code sample. */
export function Hero({
  eyebrow,
  title,
  subtitle,
  showSearch = true,
  buttons = [],
  children,
}: {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  showSearch?: boolean;
  buttons?: HeroButton[];
  children?: React.ReactNode;
}) {
  const links = buttons.flatMap((button) => {
    const href = safeHref(button.href);
    return href && button.title ? [{ ...button, href, title: button.title }] : [];
  });
  const hasAside = Array.isArray(children) ? children.some(Boolean) : Boolean(children);

  return (
    <section className={`not-prose grid items-center gap-12 py-8 lg:py-12 ${hasAside ? "lg:grid-cols-[1fr_minmax(0,1.05fr)]" : ""}`}>
      <div>
        {eyebrow && <p className="mb-4 text-sm font-medium text-accent">{eyebrow}</p>}
        {title && (
          <h1 className="font-serif text-[2.75rem] leading-[1.1] font-light tracking-tight whitespace-pre-line text-fg sm:text-[52px]">
            {title}
          </h1>
        )}
        {subtitle && <p className="mt-5 max-w-md text-lg text-fg-muted">{subtitle}</p>}
        {showSearch && <SearchField className="mt-8 h-11 max-w-md" />}
        {links.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {links.map((link) => (
              <Link
                key={`${link.href}-${link.title}`}
                href={link.href}
                data-card
                target={isExternalHref(link.href) ? "_blank" : undefined}
                rel={isExternalHref(link.href) ? "noreferrer" : undefined}
                className="flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-sm text-fg-muted no-underline transition-colors hover:border-line-strong hover:text-fg"
              >
                {link.icon && <Icon name={link.icon} className="size-3.5" />}
                {link.title}
              </Link>
            ))}
          </div>
        )}
      </div>
      {hasAside && <div className="min-w-0 shadow-sm [&_pre]:max-h-80">{children}</div>}
    </section>
  );
}
