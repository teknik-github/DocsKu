import { CircleAlert, CircleCheck, Info, Lightbulb, TriangleAlert } from "lucide-react";

export const calloutVariants = {
  note: { icon: Info, className: "border-line bg-surface", iconClass: "text-fg-muted" },
  info: {
    icon: Info,
    className: "border-sky-200 bg-sky-50 dark:border-sky-900/60 dark:bg-sky-950/30",
    iconClass: "text-sky-600 dark:text-sky-400",
  },
  tip: {
    icon: Lightbulb,
    className: "border-accent/30 bg-accent-soft/60 dark:bg-accent-soft/40",
    iconClass: "text-accent",
  },
  check: {
    icon: CircleCheck,
    className: "border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/30",
    iconClass: "text-emerald-600 dark:text-emerald-400",
  },
  warning: {
    icon: TriangleAlert,
    className: "border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30",
    iconClass: "text-amber-600 dark:text-amber-400",
  },
  danger: {
    icon: CircleAlert,
    className: "border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/30",
    iconClass: "text-red-600 dark:text-red-400",
  },
};

type CalloutProps = { title?: string | null; children: React.ReactNode };

export type CalloutVariant = keyof typeof calloutVariants;

export function Callout({ variant, title, children }: CalloutProps & { variant: CalloutVariant }) {
  const { icon: Icon, className, iconClass } = calloutVariants[variant] ?? calloutVariants.note;
  return (
    <div className={`flex gap-3 rounded-xl border px-4 py-3.5 text-sm leading-relaxed ${className}`}>
      <Icon className={`mt-0.5 size-4 shrink-0 ${iconClass}`} aria-hidden />
      <div className="min-w-0 flex-1 [&>*+*]:mt-2">
        {title && <p className="font-medium">{title}</p>}
        {children}
      </div>
    </div>
  );
}

export const Note = (props: CalloutProps) => <Callout variant="note" {...props} />;
export const InfoCallout = (props: CalloutProps) => <Callout variant="info" {...props} />;
export const Tip = (props: CalloutProps) => <Callout variant="tip" {...props} />;
export const Check = (props: CalloutProps) => <Callout variant="check" {...props} />;
export const Warning = (props: CalloutProps) => <Callout variant="warning" {...props} />;
export const Danger = (props: CalloutProps) => <Callout variant="danger" {...props} />;
