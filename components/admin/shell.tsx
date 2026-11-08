"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarCheck,
  ChartColumn,
  ExternalLink,
  FileText,
  History,
  House,
  Image as ImageIcon,
  LayoutDashboard,
  ListTree,
  LogOut,
  Menu,
  MessageSquare,
  MessageSquareText,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  Signpost,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { logoutAction } from "@/app/admin/(auth)/actions";
import { NewPageButton } from "@/components/admin/new-page-button";
import { ThemeToggle } from "@/components/theme";
import type { SessionUser } from "@/lib/auth/dal";
import { SIDEBAR_COOKIE } from "@/lib/sidebar-cookie";
import { Avatar } from "@/components/avatar";
import { can, ROLE_LABELS, type Permission } from "@/lib/auth/permissions";


export type NavCounts = { comments: number; feedback: number; drafts: number; review: number; approvals: number; changes: number };

type Item = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  /** Other paths that belong to this item (e.g. MCP lives under Pengaturan). */
  also?: string[];
  badge?: (counts: NavCounts) => { value: number; hint: string; quiet?: boolean } | null;
  /** Hidden without this permission (lib/auth/permissions.ts); the page itself checks again. */
  need?: Permission;
};
type Group = { title?: string; adminOnly?: boolean; items: Item[] };

const GROUPS: Group[] = [
  { items: [{ href: "/admin", label: "Dasbor", icon: LayoutDashboard, exact: true }] },
  {
    title: "Konten",
    items: [
      { href: "/admin/home", label: "Beranda", icon: House, need: "home.edit" },
      {
        href: "/admin/pages",
        label: "Halaman",
        icon: FileText,
        also: ["/admin/templates"],
        badge: (c) =>
          c.approvals
            ? { value: c.approvals, hint: `${c.approvals} halaman menunggu persetujuan` }
            : c.changes
              ? { value: c.changes, hint: `${c.changes} halaman Anda diminta diperbaiki` }
              : c.drafts
              ? { value: c.drafts, hint: `${c.drafts} draf atau perubahan belum terbit`, quiet: true }
              : null,
      },
      {
        href: "/admin/review",
        label: "Tinjauan",
        icon: CalendarCheck,
        need: "review.manage",
        badge: (c) => (c.review ? { value: c.review, hint: `${c.review} halaman perlu ditinjau`, quiet: true } : null),
      },
      { href: "/admin/media", label: "Media", icon: ImageIcon },
      { href: "/admin/ai", label: "AI Chat", icon: MessageSquareText },
    ],
  },
  {
    title: "Pembaca",
    items: [
      {
        href: "/admin/stats",
        label: "Statistik",
        icon: ChartColumn,
        need: "stats.view",
        badge: (c) => (c.feedback ? { value: c.feedback, hint: `${c.feedback} pesan pembaca belum ditangani` } : null),
      },
      {
        href: "/admin/comments",
        label: "Komentar",
        icon: MessageSquare,
        need: "comments.moderate",
        badge: (c) => (c.comments ? { value: c.comments, hint: `${c.comments} komentar menunggu persetujuan` } : null),
      },
    ],
  },
  {
    title: "Situs",
    adminOnly: true,
    items: [
      { href: "/admin/theme", label: "Tema", icon: Palette },
      { href: "/admin/navigation", label: "Navigasi", icon: ListTree },
      { href: "/admin/redirects", label: "Redirect", icon: Signpost },
      { href: "/admin/users", label: "Pengguna", icon: Users },
      { href: "/admin/activity", label: "Aktivitas", icon: History },
      { href: "/admin/settings", label: "Pengaturan", icon: Settings, also: ["/admin/mcp"] },
    ],
  },
];


function isActive(item: Item, pathname: string) {
  if (item.exact) return pathname === item.href;
  return [item.href, ...(item.also ?? [])].some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function SidebarContent({
  user,
  counts,
  siteName,
  collapsed = false,
  onToggle,
  onNavigate,
}: {
  user: SessionUser & { avatar?: string | null };
  counts: NavCounts;
  siteName: string;
  collapsed?: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const groups = GROUPS.filter((group) => !group.adminOnly || user.role === "admin")
    .map((group) => ({ ...group, items: group.items.filter((item) => !item.need || can(user, item.need)) }))
    .filter((group) => group.items.length > 0);

  return (
    <>
      <div className={`flex shrink-0 gap-2 ${collapsed ? "flex-col items-center px-2 py-3" : "h-14 items-center px-4"}`}>
        <Link href="/admin" onClick={onNavigate} title={collapsed ? siteName : undefined} className="flex min-w-0 flex-1 items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent font-serif text-white">
            {siteName.charAt(0).toUpperCase() || "D"}
          </span>
          {!collapsed && (
            <span className="min-w-0 truncate font-serif text-lg text-fg">
              {siteName}
              <span className="ml-1.5 text-sm text-fg-subtle">Admin</span>
            </span>
          )}
        </Link>
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? "Lebarkan sidebar" : "Ciutkan sidebar"}
            title={collapsed ? "Lebarkan sidebar" : "Ciutkan sidebar"}
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-fg-subtle hover:bg-fill hover:text-fg"
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
        )}
      </div>

      <div className={collapsed ? "px-2" : "px-3"}>
        <NewPageButton
          title={collapsed ? "Halaman baru" : undefined}
          ariaLabel="Halaman baru"
          className={`flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-accent text-sm font-medium text-white transition-colors hover:bg-accent-strong ${
            collapsed ? "px-0" : "px-3"
          }`}
        >
          <Plus className="size-4" />
          {!collapsed && "Halaman baru"}
        </NewPageButton>
      </div>

      <nav aria-label="Menu dasbor" className={`flex-1 overflow-y-auto py-3 ${collapsed ? "px-2" : "px-3"}`}>
        {groups.map((group, g) => (
          <div key={group.title ?? g} className={g ? "mt-4" : ""}>
            {group.title &&
              (collapsed ? (
                <div className="mx-2 mb-2 border-t border-line" aria-hidden />
              ) : (
                <p className="mb-1 px-3 text-[11px] font-semibold tracking-wide text-fg-subtle uppercase">{group.title}</p>
              ))}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(item, pathname);
                const badge = item.badge?.(counts) ?? null;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    title={collapsed ? (badge ? `${item.label} · ${badge.hint}` : item.label) : badge?.hint}
                    className={`relative flex h-9 items-center gap-2.5 rounded-lg text-sm transition-colors ${collapsed ? "justify-center px-0" : "px-3"} ${
                      active ? "bg-fill font-medium text-fg" : "text-fg-muted hover:bg-fill/70 hover:text-fg"
                    }`}
                  >
                    {active && <span className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-accent" aria-hidden />}
                    <span className="relative">
                      <item.icon className="size-4" />
                      {collapsed && badge && !badge.quiet && <span className="absolute -top-1 -right-1 size-2 rounded-full bg-accent ring-2 ring-page" aria-hidden />}
                    </span>
                    {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                    {!collapsed && badge && (
                      <span
                        className={`min-w-5 rounded-full px-1.5 py-px text-center text-[11px] font-medium tabular-nums ${
                          badge.quiet ? "bg-fill text-fg-subtle" : "bg-accent text-white"
                        }`}
                      >
                        {badge.value > 99 ? "99+" : badge.value}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className={`border-t border-line ${collapsed ? "space-y-1 px-2 py-3" : "p-3"}`}>
        <Link
          href="/"
          target="_blank"
          title={collapsed ? "Lihat situs" : undefined}
          className={`flex h-9 items-center gap-2.5 rounded-lg text-sm text-fg-muted hover:bg-fill/70 hover:text-fg ${collapsed ? "justify-center" : "mb-1 px-3"}`}
        >
          <ExternalLink className="size-4" />
          {!collapsed && "Lihat situs"}
        </Link>
        {collapsed ? (
          <>
            <Link
              href="/admin/profile"
              onClick={onNavigate}
              title={`${user.name} · ${ROLE_LABELS[user.role]}`}
              className="flex h-9 items-center justify-center rounded-lg text-fg-muted hover:bg-fill/70 hover:text-fg"
            >
              <Avatar name={user.name} src={user.avatar} size={28} />
            </Link>
            <div className="flex justify-center">
              <ThemeToggle />
            </div>
            <form action={logoutAction} className="flex justify-center">
              <button type="submit" aria-label="Keluar" title="Keluar" className="inline-flex size-8 items-center justify-center rounded-full text-fg-muted hover:bg-fill hover:text-fg">
                <LogOut className="size-4" />
              </button>
            </form>
          </>
        ) : (
          <div className="flex items-center gap-2 rounded-lg px-3 py-2">
            <Link href="/admin/profile" onClick={onNavigate} className="group flex min-w-0 flex-1 items-center gap-2.5">
              <Avatar name={user.name} src={user.avatar} size={32} className="ring-line group-hover:ring-2" />
              <span className="min-w-0">
                <span className="block truncate text-sm text-fg">{user.name}</span>
                <span className="block text-xs text-fg-subtle">{ROLE_LABELS[user.role]}</span>
              </span>
            </Link>
            <ThemeToggle />
            <form action={logoutAction}>
              <button type="submit" aria-label="Keluar" title="Keluar" className="inline-flex size-8 items-center justify-center rounded-full text-fg-muted hover:bg-fill hover:text-fg">
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
        )}
      </div>
    </>
  );
}

/** Dashboard pages that use the full width and height instead of the centered column. */
const FULL_BLEED = ["/admin/ai", "/admin/home"];
/** Pages that use the full width: the page list (categories left, articles right) and the comment, review and activity tables. */
const WIDE = ["/admin/pages", "/admin/comments", "/admin/review", "/admin/activity"];

export function AdminShell({
  user,
  counts,
  siteName,
  collapsed: initialCollapsed,
  children,
}: {
  user: SessionUser & { avatar?: string | null };
  counts: NavCounts;
  siteName: string;
  collapsed: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const pathname = usePathname();
  const fullBleed = FULL_BLEED.includes(pathname);
  const wide = WIDE.includes(pathname);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    // A year; read on the server so the next load starts with the same width.
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "open"}; path=/admin; max-age=31536000; samesite=lax`;
    document.documentElement.classList.toggle("sidebar-collapsed", next);
  }

  return (
    <div className="min-h-screen">
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-line bg-page transition-[width] duration-200 lg:flex ${collapsed ? "w-16" : "w-60"}`}
      >
        <SidebarContent user={user} counts={counts} siteName={siteName} collapsed={collapsed} onToggle={toggle} />
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-page/90 px-4 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Buka menu"
          className="relative inline-flex size-8 items-center justify-center rounded-full text-fg-muted hover:bg-fill"
        >
          <Menu className="size-4.5" />
          {counts.comments + counts.feedback > 0 && <span className="absolute top-1 right-1 size-2 rounded-full bg-accent" aria-hidden />}
        </button>
        <span className="truncate font-serif text-lg">{siteName}</span>
      </header>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-line bg-page">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Tutup menu"
              className="absolute top-3 right-3 z-10 inline-flex size-8 items-center justify-center rounded-full text-fg-muted hover:bg-fill"
            >
              <X className="size-4.5" />
            </button>
            <SidebarContent user={user} counts={counts} siteName={siteName} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <main className={`transition-[padding] duration-200 ${collapsed ? "lg:pl-16" : "lg:pl-60"}`}>
        {fullBleed ? (
          // AI Chat and the home builder fill the whole area beside the sidebar.
          <div className="flex h-[calc(100dvh-3.5rem)] flex-col lg:h-dvh">{children}</div>
        ) : (
          <div className={`mx-auto px-5 py-8 sm:px-8 lg:py-10 ${wide ? "max-w-[100rem]" : "max-w-5xl"}`}>{children}</div>
        )}
      </main>
    </div>
  );
}

export function AdminShellSkeleton() {
  return (
    <div className="min-h-screen">
      {/* The class comes from the script in app/admin/layout.tsx, so the skeleton matches the real width. */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-line in-[.sidebar-collapsed]:w-16 lg:block" />
      <main className="lg:pl-60 in-[.sidebar-collapsed]:lg:pl-16">
        <div className="mx-auto max-w-5xl animate-pulse px-5 py-10 sm:px-8">
          <div className="h-8 w-48 rounded bg-fill" />
          <div className="mt-8 h-40 rounded-xl bg-fill" />
        </div>
      </main>
    </div>
  );
}
