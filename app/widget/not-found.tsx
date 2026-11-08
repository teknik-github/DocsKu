import Link from "next/link";

export default function WidgetNotFound() {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-sm font-medium text-fg">Tidak ditemukan</p>
      <p className="mt-1 text-xs text-fg-subtle">Artikel ini tidak ada, sudah dipindahkan, atau widget bantuan sedang tidak aktif.</p>
      <Link href="/widget" className="mt-4 inline-block text-xs text-accent hover:underline">
        Kembali ke pencarian
      </Link>
    </div>
  );
}
