"use client";

import { useEffect, useState, useTransition } from "react";
import { PenLine } from "lucide-react";
import { getPageAuthor, setPageAuthor, type TeamAuthor } from "@/app/admin/_actions/profile";
import { Avatar } from "@/components/avatar";
import { Select } from "@/components/admin/ui";

/** "Penulis" in the editor's settings: who the byline and author box name. Applies at once. */
export function AuthorSection({ pageId }: { pageId: string }) {
  const [data, setData] = useState<{ authorId: string | null; team: TeamAuthor[] } | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let live = true;
    getPageAuthor(pageId).then((value) => live && setData(value));
    return () => {
      live = false;
    };
  }, [pageId]);

  if (data === undefined) return <div className="h-16 animate-pulse rounded-lg bg-fill" aria-hidden />;
  if (data === null) return null;
  const current = data.team.find((member) => member.id === data.authorId) ?? null;

  function change(id: string) {
    const previous = data!.authorId;
    setError("");
    setData((d) => d && { ...d, authorId: id });
    startTransition(async () => {
      const result = await setPageAuthor(pageId, id);
      if (!result.ok) {
        setData((d) => d && { ...d, authorId: previous });
        setError(result.error);
      }
    });
  }

  return (
    <section className="space-y-1.5" aria-labelledby="author-heading">
      <h3 id="author-heading" className="flex items-center gap-1.5 text-sm font-medium">
        <PenLine className="size-4" />
        Penulis
      </h3>
      <div className="flex items-center gap-2">
        <Avatar name={current?.name ?? "?"} src={current?.avatar} size={32} />
        <Select aria-label="Penulis halaman" value={data.authorId ?? ""} disabled={pending} onChange={(e) => change(e.target.value)} className="min-w-0 flex-1">
          {!data.authorId && <option value="">Belum ada</option>}
          {data.team.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
              {member.jobTitle ? ` · ${member.jobTitle}` : ""}
            </option>
          ))}
        </Select>
      </div>
      <p className="text-xs text-fg-subtle">{error ? <span className="text-red-600 dark:text-red-400">{error}</span> : "Tampil di bawah judul dan di akhir artikel. Langsung berlaku."}</p>
    </section>
  );
}
