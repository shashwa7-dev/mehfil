"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Search } from "lucide-react";
import { ReportDialog } from "@/components/report-dialog";

type MissingSong = {
  id: number;
  t: string;
  f: string;
  a: string[];
  s: string[];
};

/**
 * The songs the resolver could not place, and a way to hand us the link.
 *
 * These are not absences in the catalogue — every one is a real entry from the
 * songlist. The resolver simply never found an upload that named the song, ran
 * a plausible length and would embed. Some genuinely are not on YouTube; most
 * are just phrased in a way no automatic query reaches, and somebody who knows
 * the song finds it immediately.
 *
 * A search box rather than a wall of four hundred: nobody scans that list, but
 * plenty of people will look for the one song they noticed was missing.
 */
export default function ContributePage() {
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<MissingSong | null>(null);

  const { data, isLoading } = useQuery<{ songs: MissingSong[] }>({
    queryKey: ["missing"],
    queryFn: async () => {
      const response = await fetch("/missing-songs.json");
      return response.ok ? response.json() : { songs: [] };
    },
  });

  const songs = useMemo(() => data?.songs ?? [], [data]);
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = needle
      ? songs.filter(
          (song) =>
            song.t.toLowerCase().includes(needle) ||
            song.f.toLowerCase().includes(needle) ||
            song.a.some((name) => name.toLowerCase().includes(needle))
        )
      : songs;
    // Capped when browsing, so an idle visit does not render four hundred rows.
    return needle ? matches.slice(0, 100) : matches.slice(0, 60);
  }, [songs, query]);

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] py-1.5 pl-2 pr-3 text-xs text-foreground/80 transition hover:bg-white/[0.12]"
      >
        <ArrowLeft className="size-3.5" />
        Back
      </Link>

      <h1 className="text-3xl">Help us find these</h1>
      <p className="mt-4 text-sm leading-7 text-muted-foreground">
        {songs.length
          ? `${songs.length.toLocaleString()} songs in the catalogue have no recording we could confirm.`
          : "Some songs in the catalogue have no recording we could confirm."}{" "}
        Every one is a real entry from the Carvaan songlist — we simply could not
        find an upload that was definitely the right recording. If you know one,
        paste the link and we will check it against the catalogue.
      </p>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">
        Heard something playing the <em>wrong</em> recording instead? There is a
        flag beside the player for that — it is the more useful report of the
        two, because nothing automatic can tell a plausible match from a correct
        one.
      </p>

      <div className="relative mt-8">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search the missing songs by title, film or singer…"
          className="h-11 w-full rounded-full border border-white/10 bg-white/[0.07] pl-10 pr-4 text-sm outline-none transition placeholder:text-muted-foreground/70 hover:border-white/20 focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
        />
      </div>

      {isLoading ? (
        <p className="mt-8 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <ul className="mt-6 divide-y divide-white/[0.06]">
            {shown.map((song) => (
              <li
                key={song.id}
                className="flex items-center gap-3 py-2.5 text-sm"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{song.t}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[song.f, song.a.join(", ")].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <a
                  href={`https://www.youtube.com/results?search_query=${encodeURIComponent(
                    `${song.t} ${song.f} ${song.a[0] ?? ""}`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Search YouTube for this song"
                  className="shrink-0 rounded-full p-2 text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
                >
                  <ExternalLink className="size-4" />
                </a>
                <button
                  onClick={() => setChosen(song)}
                  className="shrink-0 rounded-full border border-primary/30 bg-primary/15 px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/25"
                >
                  I have a link
                </button>
              </li>
            ))}
          </ul>

          {!shown.length && (
            <p className="mt-8 text-sm text-muted-foreground">
              Nothing matching “{query}”. It may already be in the catalogue.
            </p>
          )}
          {!query && songs.length > shown.length && (
            <p className="mt-6 text-xs text-muted-foreground">
              Showing {shown.length} of {songs.length.toLocaleString()}. Search to
              find a particular one.
            </p>
          )}
        </>
      )}

      {chosen && (
        <ReportDialog
          kind="missing-song"
          songId={chosen.id}
          songTitle={chosen.t}
          songFilm={chosen.f}
          onClose={() => setChosen(null)}
        />
      )}
    </div>
  );
}
