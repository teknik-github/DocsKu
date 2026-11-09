import { Suspense } from "react";
import { headers } from "next/headers";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowUpRight, Bell, ChevronRight, KeyRound, Mail, Plug, Send, ShieldCheck, UserRound } from "lucide-react";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth/dal";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { authorHref } from "@/lib/authors";
import { AvatarEditor, EmailForm, PasswordForm, PublicProfileForm } from "@/components/admin/profile-forms";
import { Alert, PageHeader, Panel } from "@/components/admin/ui";
import { TwoFactorPanel } from "@/components/admin/two-factor";
import { twoFactorStatus } from "@/lib/auth/two-factor";
import { canEncrypt } from "@/lib/crypto";
import { getSiteSettings } from "@/lib/data/site";
import { getSecuritySettings } from "@/lib/data/security";
import { getAuthorPage } from "@/lib/data/authors";
import { NotificationPrefs } from "@/components/admin/notification-prefs";
import { emailReady, readEmailSettings } from "@/lib/notifications/settings";
import { readTelegramSettings, telegramCredentials } from "@/lib/telegram/settings";
import { TelegramLink } from "@/components/admin/telegram-link";

export const metadata = { title: "Profil" };

const SECTIONS = [
  { id: "publik", label: "Profil publik", icon: UserRound },
  { id: "akun", label: "Akun", icon: Mail },
  { id: "keamanan", label: "Keamanan", icon: KeyRound },
  { id: "notifikasi", label: "Notifikasi", icon: Bell },
  { id: "telegram", label: "Telegram", icon: Send },
  { id: "integrasi", label: "Integrasi", icon: Plug },
];

export default function ProfilePage({ searchParams }: PageProps<"/admin/profile">) {
  return (
    <>
      <PageHeader title="Profil" description="Foto, profil penulis yang tampil di artikel, email, password, dan verifikasi dua langkah." />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-fill" />}>
        <Profile searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Profile({ searchParams }: Pick<PageProps<"/admin/profile">, "searchParams">) {
  const user = await requireUser();
  const [status, site, security, params, [profile], h, telegram, [tgLink]] = await Promise.all([
    twoFactorStatus(user.id),
    getSiteSettings(),
    getSecuritySettings(),
    searchParams,
    db
      .select({ username: schema.users.username, avatar: schema.users.avatar, jobTitle: schema.users.jobTitle, bio: schema.users.bio, links: schema.users.links, createdAt: schema.users.createdAt, notificationPrefs: schema.users.notificationPrefs })
      .from(schema.users)
      .where(eq(schema.users.id, user.id)),
    headers(),
    readTelegramSettings(),
    db
      .select({ chatId: schema.telegramLinks.chatId, username: schema.telegramLinks.username, linkedAt: schema.telegramLinks.linkedAt })
      .from(schema.telegramLinks)
      .where(eq(schema.telegramLinks.userId, user.id)),
  ]);
  const botEnabled = Boolean(telegramCredentials(telegram));
  const telegramLinked = botEnabled && Boolean(tgLink?.chatId);
  const origin = process.env.SITE_URL?.replace(/\/+$/, "") || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const authorsOn = site.showAuthors !== false;
  // The author page exists once there is a username and at least one public article.
  const publicPage = authorsOn && profile?.username ? await getAuthorPage(profile.username) : null;
  const mustEnable = user.role === "admin" && security.requireAdmin2fa && !status.enabled;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[11rem_minmax(0,1fr)]">
      <nav aria-label="Bagian profil" className="lg:sticky lg:top-6 lg:self-start">
        <ul className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <li key={id} className="shrink-0">
              <a href={`#${id}`} className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-fg-muted hover:bg-fill/70 hover:text-fg">
                <Icon className="size-4" />
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="min-w-0 space-y-6">
        {mustEnable && (
          <Alert>
            {params["2fa"] === "wajib" ? "Admin situs ini wajib memakai verifikasi dua langkah. " : ""}
            Aktifkan verifikasi dua langkah untuk akun admin Anda di bagian Keamanan.
          </Alert>
        )}

        {/* Who you are, at a glance. */}
        <Panel className="overflow-hidden">
          <div aria-hidden className="h-20 bg-[linear-gradient(120deg,color-mix(in_srgb,var(--accent)_28%,var(--surface)),color-mix(in_srgb,var(--accent)_6%,var(--fill)))]" />
          <div className="flex flex-col items-center gap-4 px-5 pb-5 text-center sm:flex-row sm:items-end sm:text-left">
            <div className="-mt-12">
              <AvatarEditor name={user.name} avatar={profile?.avatar ?? null} />
            </div>
            <div className="min-w-0 flex-1 pb-1">
              <p className="truncate text-xl font-semibold text-fg">{user.name}</p>
              {profile?.jobTitle && <p className="truncate text-sm text-accent">{profile.jobTitle}</p>}
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-xs sm:justify-start">
                <span className="rounded-full bg-fill px-2 py-0.5 font-medium text-fg-muted">{ROLE_LABELS[user.role]}</span>
                {status.enabled && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                    <ShieldCheck className="size-3" />
                    2FA aktif
                  </span>
                )}
                <span className="truncate text-fg-subtle">{user.email}</span>
              </div>
            </div>
            <div className="pb-1">
              {publicPage && profile?.username ? (
                <Link
                  href={authorHref(profile.username)}
                  target="_blank"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-fg hover:bg-fill/60"
                >
                  Lihat profil publik
                  <ArrowUpRight className="size-3.5" />
                </Link>
              ) : (
                <p className="max-w-56 text-xs text-fg-subtle">
                  {!authorsOn
                    ? "Penulis tidak ditampilkan di situs (Tema → Penulis)."
                    : profile?.username
                      ? "Halaman penulis muncul setelah artikel Anda terbit."
                      : "Isi username agar punya halaman penulis."}
                </p>
              )}
            </div>
          </div>
        </Panel>

        <Section id="publik" title="Profil publik" description="Tampil sebagai penulis di bawah judul dan di akhir artikel yang Anda tulis, serta di halaman penulis Anda.">
          <PublicProfileForm
            origin={origin}
            profile={{ name: user.name, username: profile?.username ?? null, jobTitle: profile?.jobTitle ?? null, bio: profile?.bio ?? null, links: profile?.links ?? [], avatar: profile?.avatar ?? null }}
          />
        </Section>

        <Section id="akun" title="Akun" description="Email untuk masuk ke dasbor.">
          <div className="max-w-md">
            <EmailForm email={user.email} />
          </div>
        </Section>

        <Section id="keamanan" title="Keamanan" description="Password dan verifikasi dua langkah.">
          <div className="space-y-8">
            <div className="max-w-xl">
              <h3 className="mb-3 text-sm font-medium text-fg">Ganti password</h3>
              <PasswordForm />
            </div>
            <div id="2fa" className="scroll-mt-24 border-t border-line pt-6">
              <h3 className="text-sm font-medium text-fg">Verifikasi dua langkah</h3>
              <p className="mt-1 mb-4 text-xs text-fg-subtle">Lindungi akun dengan kode dari aplikasi autentikator di ponsel, selain password.</p>
              <TwoFactorPanel status={status} available={canEncrypt()} siteName={site.name} />
            </div>
          </div>
        </Section>

        <Section
          id="notifikasi"
          title="Notifikasi"
          description={`Email${telegramLinked ? " dan pesan Telegram" : ""} yang Anda terima dari situs ini. Anda tidak pernah diberi tahu tentang tindakan Anda sendiri.`}
        >
          <NotificationPrefs
            role={user.role}
            initial={profile?.notificationPrefs ?? {}}
            emailEnabled={emailReady(await readEmailSettings())}
            isAdmin={user.role === "admin"}
            telegram={telegramLinked}
          />
        </Section>

        <Section id="telegram" title="Telegram" description="Pakai AI Chat, cari halaman, dan terima notifikasi dari HP lewat bot Telegram situs ini.">
          <TelegramLink
            botEnabled={botEnabled}
            botUsername={telegram.botUsername}
            isAdmin={user.role === "admin"}
            initial={{ linked: telegramLinked, username: tgLink?.username ?? null, linkedAt: tgLink?.linkedAt?.toISOString() ?? null }}
          />
        </Section>

        <section id="integrasi" className="scroll-mt-24">
          <Panel>
            <Link href="/admin/mcp" className="group flex items-center gap-3 p-5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                <Plug className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-fg group-hover:text-accent">Token MCP pribadi</span>
                <span className="block text-xs text-fg-subtle">Hubungkan Claude, Cursor, atau aplikasi AI lain ke dokumentasi ini dengan akun Anda.</span>
              </span>
              <ChevronRight className="size-4 text-fg-subtle" />
            </Link>
          </Panel>
        </section>
      </div>
    </div>
  );
}

function Section({ id, title, description, children }: { id: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <Panel className="p-5 sm:p-6">
        <h2 className="text-base font-semibold text-fg">{title}</h2>
        <p className="mt-1 mb-5 text-sm text-fg-muted">{description}</p>
        {children}
      </Panel>
    </section>
  );
}
