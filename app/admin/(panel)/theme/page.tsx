import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/dal";
import { readSettingForAdmin } from "@/lib/data/admin";
import type { SiteSettings } from "@/lib/site-types";
import { ColorThemePicker, ThemePicker } from "@/components/admin/theme-picker";
import { colorThemeOf } from "@/lib/color-themes";
import { PageHeader } from "@/components/admin/ui";
import { ShowAuthorsToggle } from "@/components/admin/show-authors-toggle";

export const metadata = { title: "Tema" };

export default function ThemePage() {
  return (
    <>
      <PageHeader title="Tema" description="Pilih tata letak dokumentasi (/docs), warna situs, dan tampilan penulis. Bisa diganti kapan saja." />
      <Suspense fallback={<div className="h-80 animate-pulse rounded-xl bg-fill" />}>
        <Theme />
      </Suspense>
    </>
  );
}

async function Theme() {
  await requireAdmin();
  const site = await readSettingForAdmin<Partial<SiteSettings>>("site");
  return (
    <div className="space-y-12">
      <section>
        <h2 className="mb-1 text-sm font-semibold text-fg">Tata letak</h2>
        <p className="mb-4 text-sm text-fg-muted">Cara halaman /docs ditampilkan.</p>
        <ThemePicker current={site?.layout ?? "docs"} />
      </section>
      <section id="warna" className="scroll-mt-20">
        <h2 className="mb-1 text-sm font-semibold text-fg">Warna</h2>
        <p className="mb-4 text-sm text-fg-muted">Warna aksen dan latar untuk situs publik dan dasbor. Klik untuk melihat pratinjaunya di halaman ini.</p>
        <ColorThemePicker current={colorThemeOf(site?.colorTheme)} />
      </section>
      <section id="penulis" className="scroll-mt-20">
        <h2 className="mb-1 text-sm font-semibold text-fg">Penulis</h2>
        <p className="mb-4 text-sm text-fg-muted">Siapa yang menulis tiap artikel, di semua tata letak.</p>
        <ShowAuthorsToggle initial={site?.showAuthors !== false} />
      </section>
    </div>
  );
}
