/** Icons a page template can have (lucide names); the picker maps them in components/admin/template-icons.tsx. */
export const TEMPLATE_ICON_NAMES = [
  "file-text",
  "package",
  "list-ordered",
  "help-circle",
  "wrench",
  "megaphone",
  "code",
  "lightbulb",
  "book-open",
  "rocket",
  "shield",
  "settings",
  "users",
  "sparkles",
] as const;

export type TemplateIconName = (typeof TEMPLATE_ICON_NAMES)[number];
