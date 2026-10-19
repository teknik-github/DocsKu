export function Steps({ children }: { children: React.ReactNode }) {
  return <div className="[counter-reset:step]">{children}</div>;
}

export function Step({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="relative pb-8 pl-10 [counter-increment:step] last:pb-0 before:absolute before:top-8 before:bottom-1 before:left-[13px] before:w-px before:bg-line last:before:hidden">
      <span className="absolute top-0 left-0 flex size-7 items-center justify-center rounded-full border border-line bg-surface text-xs font-medium text-fg-muted before:content-[counter(step)]" />
      <p className="pt-0.5 font-medium text-fg">{title}</p>
      <div className="mt-2 [&>*+*]:mt-3">{children}</div>
    </div>
  );
}
