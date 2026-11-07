/** Heading and body of the login/setup forms (layout in app/admin/(auth)/layout.tsx). */
export function AuthCard({
  title,
  description,
  footer,
  children,
}: {
  title: string;
  description: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
        <p className="text-sm text-balance text-fg-muted">{description}</p>
      </div>
      {children}
      {footer && <p className="text-center text-sm text-balance text-fg-subtle">{footer}</p>}
    </div>
  );
}
