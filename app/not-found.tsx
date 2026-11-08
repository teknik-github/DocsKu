import Link from "next/link";
import { getSearchIndex } from "@/lib/data/site";
import { SimilarPages } from "@/components/similar-pages";

/**
 * 404 for every route. Suggests published pages close to the address that was
 * typed and offers a search over them; the cached public index (no headings)
 * keeps the page static.
 */
export default async function NotFound() {
  const index = (await getSearchIndex()).map((entry) => ({ ...entry, headings: [] }));
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-sm font-medium text-accent">404</p>
      <h1 className="mt-2 font-serif text-4xl font-light text-fg">Halaman tidak ditemukan</h1>
      <p className="mt-3 text-fg-muted">Halaman yang Anda cari tidak ada atau sudah dipindahkan.</p>
      <div className="mt-8 flex gap-3">
        <Link href="/" className="rounded-full bg-fg px-4 py-2 text-sm font-medium text-page hover:opacity-85">
          Ke beranda
        </Link>
        <Link href="/docs" className="rounded-full border border-line px-4 py-2 text-sm text-fg hover:bg-fill">
          Buka dokumentasi
        </Link>
      </div>
      <SimilarPages index={index} />
    </main>
  );
}
