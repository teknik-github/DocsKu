import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { authorHref, type PublicAuthor } from "@/lib/authors";
import { Avatar } from "@/components/avatar";
import { T } from "@/components/locale-text";

/**
 * Who wrote an article: a byline under the title and a box after the content,
 * in every docs layout. Both render nothing without an author (or when
 * Tema → Penulis is off; the article routes pass null then).
 */

function AuthorName({ author, className = "" }: { author: PublicAuthor; className?: string }) {
  return author.username ? (
    <Link href={authorHref(author.username)} className={`hover:text-accent hover:underline ${className}`}>
      {author.name}
    </Link>
  ) : (
    <span className={className}>{author.name}</span>
  );
}

/** Avatar, "Ditulis oleh Name" and the job title. `align="center"` for centred headers. */
export function AuthorByline({ author, align = "start", className = "" }: { author: PublicAuthor | null | undefined; align?: "start" | "center"; className?: string }) {
  if (!author) return null;
  return (
    <div data-author-byline className={`flex items-center gap-2.5 text-sm ${align === "center" ? "justify-center" : ""} ${className}`}>
      <Avatar name={author.name} src={author.avatar} size={32} />
      <span className="min-w-0 leading-tight">
        <span className="block text-fg-muted">
          <T k="writtenBy" /> <AuthorName author={author} className="font-medium text-fg" />
        </span>
        {author.jobTitle && <span className="block truncate text-xs text-fg-subtle">{author.jobTitle}</span>}
      </span>
    </div>
  );
}

/** "Tentang penulis": photo, name, job title, bio, links and the author page. */
export function AuthorBox({ author }: { author: PublicAuthor | null | undefined }) {
  if (!author) return null;
  return (
    <aside data-author-box aria-label="Penulis" className="mt-14 rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <p className="mb-4 text-xs font-medium tracking-wide text-fg-subtle uppercase">
        <T k="aboutAuthor" />
      </p>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <Avatar name={author.name} src={author.avatar} size={64} />
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-fg">
            <AuthorName author={author} />
          </p>
          {author.jobTitle && <p className="text-sm text-accent">{author.jobTitle}</p>}
          {author.bio && <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-fg-muted">{author.bio}</p>}
          {(author.links.length > 0 || author.username) && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              {author.links.map((link) => (
                <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-fg-muted hover:text-accent">
                  {link.label}
                  <ExternalLink className="size-3" />
                </a>
              ))}
              {author.username && (
                <Link href={authorHref(author.username)} className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
                  <T k="allPostsBy" />
                  <ArrowRight className="size-3.5" />
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
