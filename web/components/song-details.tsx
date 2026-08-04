"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ExternalLink, X } from "lucide-react";
import { collectionHref } from "@/lib/routes";
import { useSongCredits } from "@/lib/queries";
import { artwork, type Song } from "@/lib/catalogue";

/**
 * Everything the catalogue knows about one song.
 *
 * The songlist carries composer, lyricist, on-screen cast and director for
 * every entry, and until now hydration dropped all four — so the app held the
 * credits and could not show them. The player has room for a title and a line
 * of singers and no more, which is the reason this is a panel rather than more
 * text in the bar.
 *
 * Each name links to its collection, because the question "who wrote this?" is
 * almost always followed by "what else did they write?".
 */
export function SongDetails({
  song,
  onClose,
}: {
  song: Song;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const { data: credits } = useSongCredits();
  const credit = credits?.[String(song.id)];

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!mounted) return null;

  const rows: { label: string; names: string[]; kind?: string }[] = [
    { label: song.artists.length > 1 ? "Singers" : "Singer", names: song.artists, kind: "artists" },
    { label: song.composers.length > 1 ? "Composers" : "Composer", names: song.composers, kind: "composer" },
    { label: song.lyricists.length > 1 ? "Lyricists" : "Lyricist", names: song.lyricists, kind: "lyricist" },
    { label: "On screen", names: song.actors, kind: "actor" },
    { label: song.directors.length > 1 ? "Directors" : "Director", names: song.directors, kind: "director" },
  ].filter((row) => row.names.length > 0);

  return createPortal(
    <div
      className="fixed inset-0 z-[95] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative max-h-[85vh] w-full max-w-md overflow-hidden rounded-xl border border-white/10 bg-card shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        {/* The song's own artwork behind the credits, bled from the corner and
            masked away before it reaches the text. Decorative: it gives the
            panel the record's colour without becoming something to look at. */}
        <span
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 h-56 w-64 overflow-hidden [mask-image:linear-gradient(to_bottom_right,#000_0%,rgba(0,0,0,0.5)_45%,transparent_78%)] [-webkit-mask-image:linear-gradient(to_bottom_right,#000_0%,rgba(0,0,0,0.5)_45%,transparent_78%)]"
        >
          <img
            key={song.video}
            src={artwork(song.video, "hq")}
            alt=""
            className="size-full object-cover opacity-25 saturate-[1.3]"
          />
        </span>

        <div className="relative max-h-[85vh] overflow-y-auto p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-base leading-tight">{song.title}</p>
              {song.film && (
                <Link
                  href={collectionHref("films", song.film)}
                  onClick={onClose}
                  className="text-xs text-muted-foreground transition hover:text-foreground"
                >
                  {song.film}
                </Link>
              )}
            </div>
            <button
              onClick={onClose}
              title="Close"
              className="shrink-0 rounded-full p-1.5 text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>

          <dl className="mt-5 space-y-3">
            {rows.map((row) => (
              <div key={row.label} className="grid grid-cols-[6.5rem_1fr] gap-3">
                <dt className="text-xs text-muted-foreground">{row.label}</dt>
                <dd className="flex flex-wrap gap-x-1.5 gap-y-1 text-sm">
                  {row.names.map((name, index) => (
                    <span key={name}>
                      <Link
                        href={collectionHref(row.kind!, name)}
                        onClick={onClose}
                        className="transition hover:text-primary hover:underline"
                      >
                        {name}
                      </Link>
                      {index < row.names.length - 1 && ","}
                    </span>
                  ))}
                </dd>
              </div>
            ))}

          </dl>

          {/* The one line here that is not from the songlist. Shown only when
              somebody asked to be named. */}
          {credit && (
            <p className="mt-5 border-t border-white/[0.06] pt-4 text-xs text-primary/80">
              {credit.kind === "corrected" ? "Corrected by" : "Found by"}{" "}
              {credit.name}
            </p>
          )}

          <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-4">
            {/* Confidence is worth surfacing where the credits are: a weak match
                is exactly the case where someone should check the recording. */}
            <span className="text-[11px] text-muted-foreground">
              {song.confidence >= 0.9
                ? "Recording matched on title, film and singer"
                : song.confidence >= 0.85
                  ? "Recording matched on title and film"
                  : "Matched on limited information, may be the wrong recording"}
            </span>
            <a
              href={`https://www.youtube.com/watch?v=${song.video}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground"
            >
              YouTube <ExternalLink className="size-3" />
            </a>
        </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
