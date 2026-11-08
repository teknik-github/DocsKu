import {
  BookOpen,
  Code,
  FileText,
  HelpCircle,
  Lightbulb,
  ListOrdered,
  Megaphone,
  Package,
  Rocket,
  Settings,
  Shield,
  Sparkles,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { TemplateIconName } from "@/lib/template-icon-names";

export const TEMPLATE_ICONS: Record<TemplateIconName, LucideIcon> = {
  "file-text": FileText,
  package: Package,
  "list-ordered": ListOrdered,
  "help-circle": HelpCircle,
  wrench: Wrench,
  megaphone: Megaphone,
  code: Code,
  lightbulb: Lightbulb,
  "book-open": BookOpen,
  rocket: Rocket,
  shield: Shield,
  settings: Settings,
  users: Users,
  sparkles: Sparkles,
};

export function TemplateIcon({ name, className = "size-4" }: { name: string; className?: string }) {
  const Icon = TEMPLATE_ICONS[name as TemplateIconName] ?? FileText;
  return <Icon className={className} />;
}
