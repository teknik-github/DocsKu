import Link from "next/link";

/** `href`: the home of the language being read ("/" or "/<code>"). */
export function Logo({ name, href = "/" }: { name: string; href?: string }) {
  return (
    <Link href={href} className="flex shrink-0 items-center gap-2">
      <span className="flex size-7 items-center justify-center rounded-lg bg-accent font-serif text-base text-white">
        {name.charAt(0).toUpperCase()}
      </span>
      <span className="font-serif text-lg leading-none whitespace-nowrap text-fg">
        {name}
        <span className="ml-1.5 text-fg-subtle">Docs</span>
      </span>
    </Link>
  );
}
