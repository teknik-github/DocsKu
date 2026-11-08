"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Languages, Sparkles } from "lucide-react";
import { createPageTranslation, getPageTranslations, translatePageWithAi, type PageTranslations } from "@/app/admin/_actions/translations";
import { confirmDialog } from "@/components/admin/dialog";

const STATUS = { draft: "Draf", scheduled: "Terjadwal", published: "Terbit" } as const;

/**
 * "Terjemahan" in the editor's settings. On an original: every extra language
 * with its translation's state, plus "Buat terjemahan" (a draft copy) and
 * "Terjemahkan dengan AI" (fills the translation's working copy, never
 * publishes). On a translation: its language and a link to the original.
 * Reports whether the page is a translation, so the panel can hide what
 * translations inherit (visibility, navigation).
 */
export function TranslationSection({ pageId, status, onKind }: { pageId: string; status: string; onKind?: (isTranslation: boolean) => void }) {
  const router = useRouter();
  const [info, setInfo] = useState<PageTranslations | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let live = true;
    getPageTranslations(pageId).then((value) => {
      if (!live) return;
      setInfo(value);
      onKind?.(Boolean(value?.isTranslation));
    });
    return () => {
      live = false;
    };
    // A publish changes the "perlu diperbarui" state.
  }, [pageId, status, onKind]);

  if (info === undefined || info === null) return null;
  if (!info.isTranslation && info.languages.length === 0) return null;

  if (info.isTranslation) {
    const label = info.languages.find((language) => language.code === info.locale)?.label ?? info.locale;
    return (
      <section className="space-y-1.5" aria-labelledby="translation-heading">
        <h3 id="translation-heading" className="flex items-center gap-1.5 text-sm font-medium">
          <Languages className="size-4" />
          Terjemahan
        </h3>
        <p className="text-xs text-fg-muted">
          Terjemahan <span className="font-medium text-fg">{label}</span> dari{" "}
          <Link href={`/admin/pages/${info.original.id}`} className="font-medium text-accent hover:underline">
            {info.original.title || "Tanpa judul"}
          </Link>
          . Letak di navigasi dan visibilitasnya mengikuti halaman asli.
        </p>
      </section>
    );
  }

  function run(locale: string, mode: "copy" | "ai") {
    setError("");
    setBusy(`${locale}:${mode}`);
    startTransition(async () => {
      const existing = info?.translations.find((row) => row.locale === locale);
      if (mode === "ai" && existing) {
        const ok = await confirmDialog({
          title: "Terjemahkan ulang dengan AI?",
          message: "Isi kerja terjemahan ini diganti hasil AI. Versi sebelumnya tetap tersimpan di Riwayat revisi, dan versi yang sudah terbit tidak berubah sampai Anda menerbitkannya.",
          confirmLabel: "Terjemahkan ulang",
        });
        if (!ok) return setBusy(null);
      }
      const result = mode === "ai" ? await translatePageWithAi(pageId, locale) : await createPageTranslation(pageId, locale);
      setBusy(null);
      if (!result.ok) return setError(result.error);
      router.push(`/admin/pages/${result.id}`);
    });
  }

  return (
    <section className="space-y-2" aria-labelledby="translation-heading" data-testid="translation-section">
      <h3 id="translation-heading" className="flex items-center gap-1.5 text-sm font-medium">
        <Languages className="size-4" />
        Terjemahan
      </h3>
      <ul className="divide-y divide-line rounded-lg border border-line">
        {info.languages.map((language) => {
          const row = info.translations.find((translation) => translation.locale === language.code);
          return (
            <li key={language.code} className="space-y-1.5 px-3 py-2" data-testid={`translation-${language.code}`}>
              <div className="flex items-center gap-2 text-xs">
                <span className="w-7 font-mono font-semibold text-fg-subtle uppercase">{language.code}</span>
                <span className="min-w-0 flex-1 truncate text-fg">{language.label}</span>
                {row ? (
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      row.outdated
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
                        : row.status === "published"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
                          : "bg-fill text-fg-muted"
                    }`}
                  >
                    {row.outdated ? "Perlu diperbarui" : `${STATUS[row.status]}${row.hasChanges ? " · ada perubahan" : ""}`}
                  </span>
                ) : (
                  <span className="text-[10px] text-fg-subtle">Belum ada</span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 pl-9">
                {row ? (
                  <Link href={`/admin/pages/${row.id}`} className="rounded-md border border-line px-2 py-1 text-xs text-fg-muted hover:bg-fill hover:text-fg">
                    Buka
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => run(language.code, "copy")}
                    className="rounded-md border border-line px-2 py-1 text-xs text-fg-muted hover:bg-fill hover:text-fg disabled:opacity-50"
                  >
                    {busy === `${language.code}:copy` ? "Membuat…" : "Buat terjemahan"}
                  </button>
                )}
                {info.aiReady && (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => run(language.code, "ai")}
                    className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs text-fg-muted hover:bg-fill hover:text-fg disabled:opacity-50"
                  >
                    <Sparkles className={`size-3 ${busy === `${language.code}:ai` ? "animate-pulse" : ""}`} />
                    {busy === `${language.code}:ai` ? "Menerjemahkan…" : row ? "Terjemahkan ulang" : "Terjemahkan dengan AI"}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-fg-subtle">Terjemahan disimpan sebagai draf; terbitkan dari editornya. Ia memakai tempat halaman ini di navigasi tiap bahasa.</p>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </section>
  );
}
