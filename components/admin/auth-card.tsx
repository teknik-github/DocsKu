export function AuthCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <>
      <div className="mb-8 text-center">
        <span className="mx-auto mb-5 flex size-10 items-center justify-center rounded-xl bg-accent font-serif text-lg text-white">
          D
        </span>
        <h1 className="font-serif text-3xl font-light tracking-tight text-fg">{title}</h1>
        <p className="mt-2 text-sm text-fg-muted">{description}</p>
      </div>
      <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">{children}</div>
    </>
  );
}
