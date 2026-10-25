"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChartColumn,
  ExternalLink,
  FileText,
  House,
  Image as ImageIcon,
  LayoutDashboard,
  ListTree,
  MessageSquare,
  MessageSquareText,
  Palette,
  Plug,
  Signpost,
  LogOut,
  Menu,
  Settings,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { logoutAction } from "@/app/admin/(auth)/actions";
import { ThemeToggle } from "@/components/theme";
import type { SessionUser } from "@/lib/auth/dal";

const NAV = [
  { href: "/admin", label: "Dasbor", icon: LayoutDashboard, exact: true },
  { href: "/admin/home", label: "Beranda", icon: House },
  { href: "/admin/pages", label: "Halaman", icon: FileText },
  { href: "/admin/ai", label: "AI Chat", icon: MessageSquareText },
  { href: "/admin/stats", label: "Statistik", icon: ChartColumn },
  { href: "/admin/comments", label: "Komentar", icon: MessageSquare },
  { href: "/admin/mcp", label: "MCP", icon: Plug },
  { href: "/admin/media", label: "Media", icon: ImageIcon },
  { href: "/admin/navigation", label: "Navigasi", icon: ListTree, adminOnly: true },
  { href: "/admin/redirects", label: "Redirect", icon: Signpost, adminOnly: true },
  { href: "/admin/users", label: "Pengguna", icon: Users, adminOnly: true },
  { href: "/admin/theme", label: "Tema", icon: Palette, adminOnly: true },
  { href: "/admin/settings", label: "Pengaturan", icon: Settings, adminOnly: true },
];

const ROLE_LABEL = { admin: "Admin", editor: "Editor" };

function SidebarContent({ user, onNavigate }: { user: SessionUser; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <>
      <div className="flex h-14 items-center gap-2 px-4">
        <span className="flex size-7 items-center justify-center rounded-lg bg-accent font-serif text-white">D</span>
        <span className="font-serif text-lg text-fg">Dashboard</span>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
        {NAV.filter((item) => !item.adminOnly || user.role === "admin").map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`flex h-9 items-center gap-2.5 rounded-lg px-3 text-sm transition-colors ${
                active ? "bg-fill font-medium text-fg" : "text-fg-muted hover:bg-fill/70 hover:text-fg"
              }`}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-line p-3">
        <Link
          href="/"
          target="_blank"
          className="mb-1 flex h-9 items-center gap-2.5 rounded-lg px-3 text-sm text-fg-muted hover:bg-fill/70 hover:text-fg"
        >
          <ExternalLink className="size-4" />
          Lihat situs
        </Link>
        <div className="flex items-center gap-2 rounded-lg px-3 py-2">
          <Link href="/admin/profile" onClick={onNavigate} className="group flex min-w-0 flex-1 items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-fill text-fg-muted group-hover:text-fg">
              <UserRound className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm text-fg">{user.name}</span>
              <span className="block text-xs text-fg-subtle">{ROLE_LABEL[user.role]}</span>
            </span>
          </Link>
          <ThemeToggle />
          <form action={logoutAction}>
            <button
              type="submit"
              aria-label="Keluar"
              title="Keluar"
              className="inline-flex size-8 items-center justify-center rounded-full text-fg-muted hover:bg-fill hover:text-fg"
            >
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </div>
    </>
  );
}

/** Dashboard pages that use the full width and height instead of the centered column. */
const FULL_BLEED = ["/admin/ai"];

export function AdminShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const fullBleed = FULL_BLEED.includes(usePathname());
  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-page lg:flex">
        <SidebarContent user={user} />
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-page/90 px-4 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Buka menu"
          className="inline-flex size-8 items-center justify-center rounded-full text-fg-muted hover:bg-fill"
        >
          <Menu className="size-4.5" />
        </button>
        <span className="font-serif text-lg">Dashboard</span>
      </header>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-line bg-page">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Tutup menu"
              className="absolute top-3 right-3 inline-flex size-8 items-center justify-center rounded-full text-fg-muted hover:bg-fill"
            >
              <X className="size-4.5" />
            </button>
            <SidebarContent user={user} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <main className="lg:pl-60">
        {fullBleed ? (
          // AI Chat fills the whole area beside the sidebar.
          <div className="flex h-[calc(100dvh-3.5rem)] flex-col lg:h-dvh">{children}</div>
        ) : (
          <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8 lg:py-10">{children}</div>
        )}
      </main>
    </div>
  );
}

export function AdminShellSkeleton() {
  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-line lg:block" />
      <main className="lg:pl-60">
        <div className="mx-auto max-w-5xl animate-pulse px-5 py-10 sm:px-8">
          <div className="h-8 w-48 rounded bg-fill" />
          <div className="mt-8 h-40 rounded-xl bg-fill" />
        </div>
      </main>
    </div>
  );
}
