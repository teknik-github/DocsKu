import { BarChart3, PenLine, Sparkles } from "lucide-react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme";
import { getSiteSettings } from "@/lib/data/site";

const FEATURES = [
  { icon: PenLine, title: "Editor blok", text: "Tulis dengan callout, langkah, tab, dan blok kode." },
  { icon: Sparkles, title: "AI bawaan", text: "Draf halaman, navigasi otomatis, dan Tanya AI untuk pembaca." },
  { icon: BarChart3, title: "Statistik pembaca", text: "Lihat halaman yang dibaca dan pertanyaan yang belum terjawab." },
];

/** Login and first-run setup: form on the left, brand panel on the right (large screens). */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const site = await getSiteSettings();
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex items-center justify-between gap-4">
          <Logo name={site.name} />
          <ThemeToggle />
        </div>
        <main className="flex flex-1 items-center justify-center py-8">
          <div className="w-full max-w-xs">{children}</div>
        </main>
      </div>

      <div
        className="relative hidden overflow-hidden border-l border-line bg-fill lg:block"
        style={{
          background:
            "radial-gradient(ellipse at 20% 0%, color-mix(in srgb, var(--accent) 28%, transparent), transparent 60%), radial-gradient(ellipse at 100% 100%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 55%), var(--fill)",
        }}
      >
        {/* Faint grid, like ruled paper. */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.35] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]"
          style={{
            backgroundImage:
              "linear-gradient(to right, var(--line) 1px, transparent 1px), linear-gradient(to bottom, var(--line) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
        <div className="relative flex h-full flex-col justify-end p-10 xl:p-14">
          <p className="text-sm font-medium text-accent">{site.name} · Dashboard</p>
          <h2 className="mt-3 max-w-xl font-serif text-4xl leading-tight font-light tracking-tight text-balance text-fg xl:text-5xl">
            Tulis, terbitkan, dan rawat dokumentasi Anda.
          </h2>
          <ul className="mt-10 grid max-w-lg gap-5">
            {FEATURES.map((feature) => (
              <li key={feature.title} className="flex items-start gap-3.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-accent shadow-sm">
                  <feature.icon className="size-4" />
                </span>
                <span>
                  <span className="block text-sm font-medium text-fg">{feature.title}</span>
                  <span className="block text-sm text-fg-muted">{feature.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
