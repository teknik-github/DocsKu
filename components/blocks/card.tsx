import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Icon } from "@/components/icon";

export function Card({
  title,
  icon,
  href,
  children,
}: {
  title: string;
  icon?: string;
  href?: string;
  children?: React.ReactNode;
}) {
  const external = href && /^https?:\/\//.test(href);
  const body = (
    <>
      {icon && (
        <span className="mb-3 flex size-8 items-center justify-center rounded-lg bg-fill text-fg-muted transition-colors group-hover:bg-accent-soft group-hover:text-accent">
          <Icon name={icon} className="size-4" />
        </span>
      )}
      <span className="flex items-center gap-1 text-sm font-medium text-fg">
        {title}
        {external && <ArrowUpRight className="size-3.5 text-fg-subtle" />}
      </span>
      {children && (
        <span className="mt-1 block text-sm leading-relaxed text-fg-muted [&_p]:m-0">{children}</span>
      )}
    </>
  );
  const className =
    "group block rounded-xl border border-line bg-surface p-4 no-underline transition-colors";

  if (!href) return <div className={className}>{body}</div>;
  return (
    <Link
      href={href}
      data-card
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className={`${className} hover:border-line-strong hover:bg-fill/40`}
    >
      {body}
    </Link>
  );
}

export function CardGroup({ cols = 2, children }: { cols?: 1 | 2 | 3 | 4; children: React.ReactNode }) {
  const grid = { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" }[cols];
  return <div className={`grid gap-3 ${grid}`}>{children}</div>;
}
