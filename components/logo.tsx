import Link from "next/link";

export function Logo({ name }: { name: string }) {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2">
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
