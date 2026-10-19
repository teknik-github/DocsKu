import type { ComponentProps, ReactNode } from "react";

/** Shared dashboard form controls. Hook-free, so usable from server and client components. */

export const inputClass =
  "h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm text-fg outline-none transition-colors placeholder:text-fg-subtle focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-60";

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-fg">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-red-600 dark:text-red-400">{error}</span>
      ) : (
        hint && <span className="mt-1 block text-xs text-fg-subtle">{hint}</span>
      )}
    </label>
  );
}

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function Textarea(props: ComponentProps<"textarea">) {
  return (
    <textarea
      {...props}
      className={`${inputClass} h-auto min-h-20 py-2 ${props.className ?? ""}`}
    />
  );
}

export function Select(props: ComponentProps<"select">) {
  return <select {...props} className={`${inputClass} pr-8 ${props.className ?? ""}`} />;
}

const buttonVariants = {
  primary: "bg-fg text-page hover:opacity-85",
  accent: "bg-accent text-white hover:bg-accent-strong",
  secondary: "border border-line bg-surface text-fg hover:bg-fill",
  ghost: "text-fg-muted hover:bg-fill hover:text-fg",
  danger: "border border-red-200 bg-surface text-red-600 hover:bg-red-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/40",
};

export function buttonClass(variant: keyof typeof buttonVariants = "primary", size: "sm" | "md" = "md") {
  return `inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50 ${
    size === "sm" ? "h-8 px-3 text-xs" : "h-9 px-4 text-sm"
  } ${buttonVariants[variant]}`;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: keyof typeof buttonVariants; size?: "sm" | "md" }) {
  return <button type="button" {...props} className={`${buttonClass(variant, size)} ${className}`} />;
}

export function Alert({ tone = "error", children }: { tone?: "error" | "success"; children: ReactNode }) {
  const style =
    tone === "error"
      ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"
      : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300";
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-lg border px-3 py-2 text-sm ${style}`}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-serif text-3xl font-light tracking-tight text-fg">{title}</h1>
        {description && <p className="mt-1.5 text-sm text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-line bg-surface ${className}`}>{children}</div>;
}

export function StatusBadge({ status }: { status: "draft" | "scheduled" | "published" }) {
  const map = {
    draft: { label: "Draf", className: "bg-fill text-fg-muted" },
    scheduled: { label: "Terjadwal", className: "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300" },
    published: { label: "Terbit", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" },
  }[status];
  return (
    <span className={`inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium ${map.className}`}>
      {map.label}
    </span>
  );
}
