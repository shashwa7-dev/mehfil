"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LayoutGrid, ListMusic, Play, Search, X } from "lucide-react";
import { BrowseGrid } from "@/components/browse-grid";
import { FacetPanel } from "@/components/facet-panel";
import { PlayerBar } from "@/components/player-bar";
import { TrackRow } from "@/components/track-row";
import { filterSongs, hydrate, type Catalogue, type RawSong } from "@/lib/catalogue";

const PAGE_SIZE = 80;

export default function Home() {
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Record<string, Set<number>>>({});
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [current, setCurrent] = useState<number | null>(null);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [showList, setShowList] = useState(false);

  const scrollRef = useRef<HTMLElement>(null);

  useEffect(() => {
    fetch("/catalogue.json")
      .then((r) => r.json())
      .then(setCatalogue);
  }, []);

  const results = useMemo(
    () => (catalogue ? filterSongs(catalogue, selected, query) : []),
    [catalogue, selected, query]
  );

  const activeCount = Object.values(selected).reduce((n, s) => n + s.size, 0);
  // Browse until there is something specific to show.
  const listing = showList || activeCount > 0 || query.trim().length > 0;

  useEffect(() => {
    setLimit(PAGE_SIZE);
    scrollRef.current?.scrollTo({ top: 0 });
  }, [selected, query, showList]);

  const queueRef = useRef<RawSong[]>([]);
  queueRef.current = results;

  const toggle = useCallback((facet: string, index: number) => {
    setSelected((prev) => {
      const next = { ...prev };
      const set = new Set(next[facet] ?? []);
      if (set.has(index)) set.delete(index);
      else set.add(index);
      next[facet] = set;
      return next;
    });
  }, []);

  const play = useCallback((id: number) => {
    setCurrent(id);
    setPlaying(true);
  }, []);

  const step = useCallback(
    (delta: number) => {
      const queue = queueRef.current;
      if (queue.length === 0) return;
      if (shuffle && delta > 0) {
        play(queue[Math.floor(Math.random() * queue.length)].id);
        return;
      }
      const at = queue.findIndex((s) => s.id === current);
      const next = queue[(at + delta + queue.length) % queue.length] ?? queue[0];
      play(next.id);
    },
    [current, play, shuffle]
  );

  const onEnded = useCallback(() => {
    if (repeat && current !== null) {
      const id = current;
      setCurrent(null);
      window.setTimeout(() => setCurrent(id), 0);
      return;
    }
    step(1);
  }, [repeat, current, step]);

  const playFirst = useCallback(
    (songs: RawSong[]) => {
      if (songs.length === 0) return;
      play(
        shuffle ? songs[Math.floor(Math.random() * songs.length)].id : songs[0].id
      );
    },
    [play, shuffle]
  );

  /** Card play: filter to that value, then start it immediately. */
  const playFacet = useCallback(
    (facet: string, index: number) => {
      if (!catalogue) return;
      const next = { [facet]: new Set([index]) };
      setSelected(next);
      playFirst(filterSongs(catalogue, next, ""));
    },
    [catalogue, playFirst]
  );

  const currentSong = useMemo(() => {
    if (!catalogue || current === null) return null;
    const raw = catalogue.songs.find((s) => s.id === current);
    return raw ? hydrate(raw, catalogue.facets) : null;
  }, [catalogue, current]);

  const activeChips = useMemo(() => {
    if (!catalogue) return [];
    return Object.entries(selected).flatMap(([facet, set]) =>
      [...set].map((i) => ({
        facet,
        index: i,
        label: catalogue.facets[facet as keyof Catalogue["facets"]][i],
      }))
    );
  }, [catalogue, selected]);

  if (!catalogue) {
    return (
      <div className="grid h-screen place-items-center text-sm text-muted-foreground">
        Loading catalogue…
      </div>
    );
  }

  const heading = activeChips.length
    ? activeChips.map((c) => c.label).join(" · ")
    : query.trim()
      ? `Results for “${query}”`
      : "All songs";

  const reset = () => {
    setSelected({});
    setQuery("");
    setShowList(false);
  };

  return (
    <div className="flex h-screen flex-col">
      <div className="flex min-h-0 flex-1 gap-2 p-2">
        <aside className="hidden w-72 shrink-0 flex-col overflow-hidden rounded-lg bg-sidebar lg:flex">
          <div className="shrink-0 px-4 pb-3 pt-4">
            <button onClick={reset} className="text-left">
              <h1 className="text-base font-semibold tracking-tight">Carvaan</h1>
              <p className="text-xs text-muted-foreground">
                {catalogue.songs.length.toLocaleString()} songs ·{" "}
                {catalogue.facets.stations.length} stations
              </p>
            </button>
          </div>

          <div className="shrink-0 space-y-0.5 px-2 pb-2">
            <button
              onClick={reset}
              className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition ${
                !listing
                  ? "bg-white/[0.09] text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutGrid className="size-4" /> Browse
            </button>
            <button
              onClick={() => {
                setSelected({});
                setQuery("");
                setShowList(true);
              }}
              className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition ${
                listing
                  ? "bg-white/[0.09] text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ListMusic className="size-4" /> All songs
            </button>
          </div>

          <div className="min-h-0 flex-1 border-t border-white/[0.06]">
            <FacetPanel
              catalogue={catalogue}
              results={results}
              selected={selected}
              onToggle={toggle}
              onClear={() => setSelected({})}
            />
          </div>
        </aside>

        <main
          ref={scrollRef}
          className="scroll-slim min-w-0 flex-1 overflow-y-auto rounded-lg bg-gradient-to-b from-white/[0.06] to-transparent"
        >
          <div className="sticky top-0 z-20 bg-background/70 px-6 py-3 backdrop-blur">
            <div className="relative max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search songs, films, singers…"
                className="h-9 w-full rounded-full border border-white/10 bg-white/[0.06] pl-9 pr-8 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/50"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="px-6 pb-10">
            {!listing ? (
              <>
                <h2 className="pb-4 pt-2 text-2xl font-bold tracking-tight">Browse</h2>
                <BrowseGrid catalogue={catalogue} onPick={toggle} onPlay={playFacet} />
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-end justify-between gap-3 pb-4 pt-2">
                  <div className="min-w-0">
                    <h2 className="truncate text-2xl font-bold tracking-tight">
                      {heading}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {results.length.toLocaleString()} songs
                    </p>
                  </div>
                  {results.length > 0 && (
                    <button
                      onClick={() => playFirst(results)}
                      className="grid size-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:scale-105"
                      title="Play"
                    >
                      <Play className="size-5 translate-x-px fill-current" />
                    </button>
                  )}
                </div>

                {activeChips.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pb-4">
                    {activeChips.map((chip) => (
                      <button
                        key={`${chip.facet}-${chip.index}`}
                        onClick={() => toggle(chip.facet, chip.index)}
                        className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs text-primary transition hover:bg-primary/25"
                      >
                        {chip.label}
                        <X className="size-3" />
                      </button>
                    ))}
                    <button
                      onClick={() => setSelected({})}
                      className="rounded-full px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Clear all
                    </button>
                  </div>
                )}

                {results.length === 0 ? (
                  <div className="py-20 text-center">
                    <p className="text-sm text-muted-foreground">
                      Nothing matches those filters.
                    </p>
                    <button
                      onClick={reset}
                      className="mt-3 text-xs text-primary hover:underline"
                    >
                      Back to browse
                    </button>
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {results.slice(0, limit).map((raw, i) => {
                      const song = hydrate(raw, catalogue.facets);
                      return (
                        <TrackRow
                          key={song.id}
                          song={song}
                          index={i}
                          active={song.id === current}
                          playing={playing}
                          onPlay={() => play(song.id)}
                        />
                      );
                    })}
                  </div>
                )}

                {limit < results.length && (
                  <div className="pt-6 text-center">
                    <button
                      onClick={() => setLimit((n) => n + PAGE_SIZE)}
                      className="rounded-full border border-white/15 px-4 py-2 text-xs text-muted-foreground transition hover:border-white/30 hover:text-foreground"
                    >
                      Load {Math.min(PAGE_SIZE, results.length - limit)} more (
                      {(results.length - limit).toLocaleString()} left)
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>

      <PlayerBar
        song={currentSong}
        shuffle={shuffle}
        repeat={repeat}
        onToggleShuffle={() => setShuffle((v) => !v)}
        onToggleRepeat={() => setRepeat((v) => !v)}
        onNext={() => step(1)}
        onPrev={() => step(-1)}
        onEnded={onEnded}
        onPlayingChange={setPlaying}
      />
    </div>
  );
}
