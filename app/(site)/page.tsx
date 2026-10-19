import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Icon } from "@/components/icon";
import { Card, CardGroup } from "@/components/blocks/card";
import { SearchField } from "@/components/search";
import { SiteFooter } from "@/components/site-footer";
import { HomeArticle } from "@/components/home-article";
import { getHomePage } from "@/lib/data/site";
import { pageMetadata } from "@/lib/seo";
import { CodeGroup } from "@/components/blocks/code";

// Beranda bawaan. Setelah beranda diterbitkan dari dashboard (menu Beranda),
// halaman itu yang tampil. Ubah teks di bawah hanya untuk tampilan bawaan.
// Nama ikon yang tersedia ada di components/icon.tsx. Contoh kode di hero ada di `heroCode`.

const hero = {
  eyebrow: "Docsku",
  title: "Mulai membangun\ndengan Docsku",
  subtitle:
    "Semua yang Anda butuhkan untuk memahami dan memakai produk ini. Dari langkah pertama sampai siap produksi.",
  chips: [
    { title: "Mulai cepat", href: "/docs/mulai-cepat", icon: "play" },
    { title: "Komponen", href: "/docs/menulis/komponen", icon: "puzzle" },
    { title: "Referensi API", href: "/docs/api/ikhtisar", icon: "code" },
  ],
};

const heroCode = [
  {
    title: "JavaScript",
    language: "js",
    code: `const res = await fetch("https://api.contoh.com/v1/items", {
  headers: {
    Authorization: \`Bearer \${process.env.API_KEY}\`,
  },
});

const { data } = await res.json();
for (const item of data) {
  console.log(item.name);
}`,
  },
  {
    title: "Python",
    language: "python",
    code: `import os
import requests

res = requests.get(
    "https://api.contoh.com/v1/items",
    headers={"Authorization": f"Bearer {os.environ['API_KEY']}"},
)

for item in res.json()["data"]:
    print(item["name"])`,
  },
  {
    title: "cURL",
    language: "bash",
    code: `curl https://api.contoh.com/v1/items \\
  -H "Authorization: Bearer $API_KEY"`,
  },
];

const paths = [
  {
    title: "Panduan",
    description:
      "Pelajari konsep dasar, tulis halaman pertama Anda, lalu sesuaikan tampilan situs dokumentasi.",
    icon: "book",
    links: [
      { title: "Pengenalan", href: "/docs/pengenalan", icon: "compass" },
      { title: "Mulai cepat", href: "/docs/mulai-cepat", icon: "play" },
      { title: "Membuat halaman baru", href: "/docs/menulis/halaman-baru", icon: "file" },
    ],
  },
  {
    title: "Referensi API",
    description:
      "Detail setiap endpoint, parameter, dan respons. Cocok saat Anda sudah tahu apa yang ingin dibangun.",
    icon: "terminal",
    links: [
      { title: "Ikhtisar", href: "/docs/api/ikhtisar", icon: "layers" },
      { title: "Autentikasi", href: "/docs/api/autentikasi", icon: "key" },
      { title: "Daftar item", href: "/docs/api/item/daftar", icon: "database" },
    ],
  },
];

const journey = [
  {
    title: "Mulai",
    links: [
      { title: "Pengenalan", href: "/docs/pengenalan", icon: "compass" },
      { title: "Mulai cepat", href: "/docs/mulai-cepat", icon: "play" },
    ],
  },
  {
    title: "Tulis",
    links: [
      { title: "Halaman baru", href: "/docs/menulis/halaman-baru", icon: "file" },
      { title: "Komponen", href: "/docs/menulis/komponen", icon: "puzzle" },
      { title: "Blok kode", href: "/docs/menulis/blok-kode", icon: "code" },
    ],
  },
  {
    title: "Sesuaikan",
    links: [
      { title: "Navigasi", href: "/docs/kustomisasi/navigasi", icon: "settings" },
      { title: "Tema dan warna", href: "/docs/kustomisasi/tema", icon: "palette" },
    ],
  },
  {
    title: "Terbitkan",
    links: [
      { title: "Referensi API", href: "/docs/api/ikhtisar", icon: "terminal" },
      { title: "Catatan rilis", href: "/docs/catatan-rilis", icon: "star" },
    ],
  },
];

const resources = [
  { title: "Catatan rilis", href: "/docs/catatan-rilis", icon: "star", description: "Fitur dan perubahan terbaru." },
  { title: "Komponen", href: "/docs/menulis/komponen", icon: "puzzle", description: "Callout, kartu, tab, dan langkah." },
  { title: "GitHub", href: "https://github.com", icon: "code", description: "Kode sumber dan isu." },
];

function SectionHeader({ label, title, description }: { label: string; title: string; description?: string }) {
  return (
    <div className="mb-8 max-w-2xl">
      <p className="mb-2 text-sm font-medium text-accent">{label}</p>
      <h2 className="font-serif text-3xl font-light tracking-tight text-fg sm:text-4xl">{title}</h2>
      {description && <p className="mt-3 text-fg-muted">{description}</p>}
    </div>
  );
}

function IconLink({ title, href, icon }: { title: string; href: string; icon: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-2.5 rounded-lg py-1.5 text-sm text-fg-muted transition-colors hover:text-fg"
    >
      <Icon name={icon} className="size-4 text-fg-subtle transition-colors group-hover:text-accent" />
      {title}
    </Link>
  );
}

/** Built-in home, shown until a home page is published from the dashboard (Beranda). */
function BuiltInHome() {
  return (
    <>
      <main className="mx-auto max-w-6xl px-5 sm:px-8">
        <section className="grid items-center gap-12 py-16 lg:grid-cols-[1fr_minmax(0,1.05fr)] lg:py-24">
          <div>
            <p className="mb-4 text-sm font-medium text-accent">{hero.eyebrow}</p>
            <h1 className="font-serif text-[2.75rem] leading-[1.1] font-light tracking-tight whitespace-pre-line text-fg sm:text-[52px]">
              {hero.title}
            </h1>
            <p className="mt-5 max-w-md text-lg text-fg-muted">{hero.subtitle}</p>
            <SearchField className="mt-8 h-11 max-w-md" />
            <div className="mt-4 flex flex-wrap gap-2">
              {hero.chips.map((chip) => (
                <Link
                  key={chip.href}
                  href={chip.href}
                  className="flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-sm text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
                >
                  <Icon name={chip.icon} className="size-3.5" />
                  {chip.title}
                </Link>
              ))}
            </div>
          </div>
          <div className="min-w-0 shadow-sm [&_pre]:max-h-80">
            <CodeGroup blocks={heroCode} />
          </div>
        </section>

        <section className="border-t border-line py-16 lg:py-20">
          <SectionHeader
            label="Jalur"
            title="Pilih cara Anda belajar"
            description="Mulai dari panduan langkah demi langkah, atau langsung ke detail teknis."
          />
          <div className="grid gap-4 md:grid-cols-2">
            {paths.map((path) => (
              <div key={path.title} className="rounded-2xl border border-line bg-surface p-6">
                <span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
                  <Icon name={path.icon} className="size-5" />
                </span>
                <h3 className="mt-5 text-lg font-medium text-fg">{path.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{path.description}</p>
                <div className="mt-5 border-t border-line pt-4">
                  {path.links.map((link) => (
                    <IconLink key={link.href} {...link} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-line py-16 lg:py-20">
          <SectionHeader
            label="Alur kerja"
            title="Dari ide sampai terbit"
            description="Ikuti urutannya, atau langsung lompat ke yang Anda butuhkan."
          />
          <ol className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {journey.map((step, i) => (
              <li key={step.title}>
                <div className="flex items-center gap-3">
                  <span className="flex size-7 items-center justify-center rounded-full border border-line bg-surface text-xs font-medium text-fg-muted">
                    {i + 1}
                  </span>
                  <h3 className="font-medium text-fg">{step.title}</h3>
                </div>
                <div className="mt-3 border-l border-line pl-[22px] ml-3.5">
                  {step.links.map((link) => (
                    <IconLink key={link.href} {...link} />
                  ))}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-t border-line py-16 lg:py-20">
          <SectionHeader label="Sumber daya" title="Terus belajar" />
          <CardGroup cols={3}>
            {resources.map((resource) => (
              <Card key={resource.href} title={resource.title} href={resource.href} icon={resource.icon}>
                {resource.description}
              </Card>
            ))}
          </CardGroup>
          <Link
            href="/docs/pengenalan"
            className="mt-8 inline-flex items-center gap-1.5 text-sm font-medium text-fg hover:text-accent"
          >
            Baca dokumentasi lengkap
            <ArrowRight className="size-4" />
          </Link>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

export async function generateMetadata() {
  const home = await getHomePage();
  if (!home) return {};
  // The home keeps the site name as its default title unless a meta title is set.
  const { title, ...rest } = pageMetadata(home, "website");
  return home.seo?.title ? { title, ...rest } : rest;
}

export default async function Home() {
  const home = await getHomePage();
  return home ? <HomeArticle doc={home.content} /> : <BuiltInHome />;
}
