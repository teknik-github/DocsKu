import Link from "next/link";
import { StickyNote } from "lucide-react";
import { listOpenNotesFor } from "@/lib/data/notes";
import { Panel } from "@/components/admin/ui";
import { formatDateTime } from "@/components/admin/format";

/** "Catatan tim terbuka": open internal notes on the person's pages or in their conversations (hidden when there are none). */
export async function OpenNotes({ userId, className = "" }: { userId: string; className?: string }) {
  const { notes, total } = await listOpenNotesFor(userId);
  if (total === 0) return null;
  return (
    <Panel className={className} data-testid="open-notes">
      <h2 className="flex items-center gap-2 border-b border-line px-5 py-3 text-sm font-medium text-fg">
        <StickyNote className="size-4 text-amber-500" />
        Catatan tim terbuka ({total})
      </h2>
      <ul className="divide-y divide-line">
        {notes.map((note) => (
          <li key={note.id}>
            <Link href={`/admin/pages/${note.pageId}?catatan=${note.id}`} className="block px-5 py-3 hover:bg-fill/40">
              <span className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{note.pageTitle}</span>
                <span className="shrink-0 text-xs text-fg-subtle">{formatDateTime(note.createdAt)}</span>
              </span>
              {note.quote && <span className="mt-0.5 block truncate border-l-2 border-amber-400 pl-2 text-xs text-fg-muted italic">“{note.quote}”</span>}
              <span className="mt-0.5 block truncate text-sm text-fg-muted">
                {note.author}: {note.body}
                {note.replies > 0 && <span className="text-fg-subtle"> · {note.replies} balasan</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
