import {
  BookOpen,
  Boxes,
  Code,
  Compass,
  Database,
  FileText,
  Globe,
  GraduationCap,
  Key,
  Layers,
  Lightbulb,
  Lock,
  MessageSquare,
  Palette,
  Play,
  Puzzle,
  Rocket,
  Settings,
  Sparkles,
  Star,
  Terminal,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";

/** Icons usable by name in MDX, e.g. `<Card icon="rocket" />`. Add more here. */
const icons: Record<string, LucideIcon> = {
  book: BookOpen,
  boxes: Boxes,
  code: Code,
  compass: Compass,
  database: Database,
  file: FileText,
  globe: Globe,
  "graduation-cap": GraduationCap,
  key: Key,
  layers: Layers,
  lightbulb: Lightbulb,
  lock: Lock,
  message: MessageSquare,
  palette: Palette,
  play: Play,
  puzzle: Puzzle,
  rocket: Rocket,
  settings: Settings,
  sparkles: Sparkles,
  star: Star,
  terminal: Terminal,
  wrench: Wrench,
  zap: Zap,
};

export const iconNames = Object.keys(icons);

export function Icon({ name, className }: { name: string; className?: string }) {
  const Component = icons[name] ?? FileText;
  return <Component className={className} aria-hidden />;
}
