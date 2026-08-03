"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LayoutGrid, ListMusic, Loader2, Menu, Play, Search, X } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { BrowseGrid } from "@/components/browse-grid";
import { FacetPanel } from "@/components/facet-panel";
import { InstallButton, InstallPrompt } from "@/components/install-prompt";
import { PlayerBar } from "@/components/player-bar";
import { SongList } from "@/components/song-list";
import { artwork, filterSongs, hydrate, type Catalogue, type RawSong } from "@/lib/catalogue";
import { useCatalogue } from "@/lib/queries";
import { useHistoryState } from "@/hooks/use-history-state";
import {
  deserialiseView,
  serialiseView,
  viewStepKey,
  type ViewState,
} from "@/lib/view-state";

export default function Home() {
  const { data: catalogue, isLoading, isError, error } = useCatalogue();

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Record<string, Set<number>>>({});
  const [current, setCurrent] = useState<number | null>(null);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [showList, setShowList] = useState(false);
  const [ambient, setAmbient] = useState(true);

  // Virtuoso needs the resolved scroll node, not a ref, so a callback ref
  // stores it in state and re-renders the lists once it exists.
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);

  const results = useMemo(
    () => (catalogue ? filterSongs(catalogue, selected, query) : []),
    [catalogue, selected, query]
  );

  const activeCount = Object.values(selected).reduce((n, s) => n + s.size, 0);
  const listing = showList || activeCount > 0 || query.trim().length > 0;

  // Identifies the current result set, so the paged query resets on change.
  const filterKey = useMemo(
    () =>
      JSON.stringify({
        q: query.trim(),
        f: Object.entries(selected)
          .filter(([, s]) => s.size)
          .map(([k, s]) => [k, [...s].sort()])
          .sort(),
      }),
    [query, selected]
  );

  useEffect(() => {
    scrollEl?.scrollTo({ top: 0 });
  }, [filterKey, showList, scrollEl]);

  // Back retraces filter and view changes instead of leaving the app. Held
  // until the catalogue exists, or an entry could be restored against facets
  // that are not loaded yet.
  const view = useMemo(
    () => serialiseView(selected, query, showList),
    [selected, query, showList]
  );

  useHistoryState<ViewState>({
    value: view,
    stepKey: viewStepKey,
    namespace: "mehfilView",
    enabled: Boolean(catalogue),
    onRestore: useCallback((restored: ViewState) => {
      const { selection, query: q, list } = deserialiseView(restored);
      setSelected(selection);
      setQuery(q);
      setShowList(list);
    }, []),
  });


  const queueRef = useRef<RawSong[]>([]);
  queueRef.current = results;

  const toggle = useCallback((facet: string, index: number) => {
    setSelected((prev) => {
      const next = { ...prev };
      const set = new Set(next[facet] ?? []);
      if (set.has(index)) set.delete(index);
      else set.add(index);
      if (set.size === 0) delete next[facet];
      else next[facet] = set;
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

  // Songs YouTube refused this session. Kept so auto-skip cannot bounce back
  // into a dead track and loop, and so the list can mark them.
  const [unplayable, setUnplayable] = useState<Record<number, string>>({});

  const handleUnplayable = useCallback(
    (songId: number, reason: string) => {
      setUnplayable((prev) => (prev[songId] ? prev : { ...prev, [songId]: reason }));
      // Only advance if this is still the song on screen; a late error from a
      // track the user already skipped past must not hijack playback.
      if (songId !== current) return;
      const queue = queueRef.current;
      const at = queue.findIndex((s) => s.id === songId);
      for (let i = 1; i <= queue.length; i++) {
        const candidate = queue[(at + i) % queue.length];
        if (!candidate || candidate.id === songId) break;
        if (!unplayable[candidate.id]) {
          play(candidate.id);
          return;
        }
      }
    },
    [current, play, unplayable]
  );

  const playFirst = useCallback(
    (songs: RawSong[]) => {
      if (songs.length === 0) return;
      play(shuffle ? songs[Math.floor(Math.random() * songs.length)].id : songs[0].id);
    },
    [play, shuffle]
  );

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

  if (isLoading) {
    return (
      <div className="relative grid h-[100dvh] place-items-center overflow-hidden px-6">
        {/* Same warm bloom the player uses, so the wait already feels like
            the app rather than a blank screen. */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 size-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[120px]"
        />
        <div className="relative flex flex-col items-center text-center">
          <img
            src="/logo.png"
            alt=""
            width={88}
            height={88}
            className="size-22 animate-pulse rounded-2xl shadow-2xl"
          />
          <h1 className="mt-5 text-2xl tracking-tight">Mehfil</h1>
          <p className="mt-1 text-xs text-muted-foreground">Retro Bollywood songs</p>

          <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Loading catalogue…
          </div>
        </div>
      </div>
    );
  }

  if (isError || !catalogue) {
    return (
      <div className="grid h-[100dvh] place-items-center px-6 text-center">
        <div className="flex flex-col items-center">
          <img
            src="/logo.png"
            alt=""
            width={64}
            height={64}
            className="size-16 rounded-2xl opacity-60 grayscale"
          />
          <p className="mt-5 text-sm">Could not load the catalogue.</p>
          <p className="mt-1 max-w-xs text-xs text-muted-foreground">
            {error instanceof Error ? error.message : "Unknown error"}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-5 rounded-full border border-white/15 px-4 py-2 text-xs transition hover:border-white/30"
          >
            Try again
          </button>
        </div>
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

  const navButton = (on: boolean) =>
    `flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition ${
      on ? "bg-white/[0.09] text-foreground" : "text-muted-foreground hover:text-foreground"
    }`;

  // One definition shared by the desktop rail and the mobile sheet, so the
  // two can never drift apart.
  const sidebar = (
    <>
      <div className="shrink-0 px-4 pb-3 pt-4">
        <button onClick={reset} className="flex items-center gap-2.5 text-left">
          <img
            src="/logo.png"
            alt=""
            className="size-9 shrink-0 rounded-lg"
            width={36}
            height={36}
          />
          <span>
            <span className="block text-lg leading-tight tracking-tight">Mehfil</span>
            <span className="block text-xs text-muted-foreground">
              {catalogue.songs.length.toLocaleString()} songs ·{" "}
              {catalogue.facets.stations.length} stations
            </span>
          </span>
        </button>
      </div>

      <div className="shrink-0 space-y-0.5 px-2 pb-2">
        <button onClick={reset} className={navButton(!listing)}>
          <LayoutGrid className="size-4" /> Browse
        </button>
        <button
          onClick={() => {
            setSelected({});
            setQuery("");
            setShowList(true);
          }}
          className={navButton(listing)}
        >
          <ListMusic className="size-4" /> All songs
        </button>
        {/* Renders itself only where installing is actually possible. */}
        <InstallButton />
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

      <div className="shrink-0 border-t border-white/[0.06] px-4 py-2.5">
        <a
          href="https://shashwa7.in"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-muted-foreground transition hover:text-foreground"
        >
          Made with <span className="text-primary">♥</span> by shashwa7.in
        </a>
      </div>
    </>
  );

  return (
    <div className="relative flex h-[100dvh] flex-col">
      {/* App-wide ambient wash, far subtler than the full-screen one: enough to
          tint the shell with the current song without disturbing text. */}
      {ambient && currentSong && (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <img
            key={currentSong.video}
            src={artwork(currentSong.video, "hq")}
            alt=""
            className="absolute -top-1/4 left-1/2 h-[80%] w-[120%] -translate-x-1/2 object-cover opacity-[0.18] blur-[130px] saturate-150 transition-opacity duration-1000"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background" />
        </div>
      )}

      {/* Full-bleed on mobile; the inset rail-and-panel layout only makes
          sense once the sidebar is actually visible. */}
      <div className="flex min-h-0 flex-1 gap-0 p-0 lg:gap-2 lg:p-2">
        <aside className="hidden w-72 shrink-0 flex-col overflow-hidden rounded-lg bg-sidebar lg:flex">
          {sidebar}
        </aside>

        <main
          ref={setScrollEl}
          className="scroll-slim min-w-0 flex-1 overflow-y-auto rounded-none bg-gradient-to-b from-white/[0.06] to-transparent lg:rounded-lg"
        >
          <div className="sticky top-0 z-20 flex items-center gap-2 bg-background/70 px-4 py-3 backdrop-blur sm:px-6">
            {/* The sidebar carries the brand on desktop but is hidden below lg,
                so mobile needs its own mark. */}
            <button
              onClick={reset}
              className="flex shrink-0 items-center gap-2 lg:hidden"
              title="Mehfil"
            >
              <img
                src="/logo.png"
                alt=""
                width={32}
                height={32}
                className="size-8 rounded-lg"
              />
              <span className="hidden text-base leading-none tracking-tight sm:inline">
                Mehfil
              </span>
            </button>

            <div className="relative w-full max-w-md">
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

            {/* The desktop rail is hidden below lg, so filters need a way in.
                ml-auto keeps it pinned right once the search stops growing. */}
            <Sheet>
              <SheetTrigger
                render={
                  <button
                    title="Filters"
                    className="relative ml-auto grid size-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.06] text-muted-foreground transition hover:text-foreground lg:hidden"
                  />
                }
              >
                <Menu className="size-4" />
                {activeCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full bg-primary text-[9px] font-semibold text-primary-foreground">
                    {activeCount}
                  </span>
                )}
              </SheetTrigger>
              <SheetContent side="left" className="flex w-[19rem] flex-col bg-sidebar p-0">
                <SheetTitle className="sr-only">Filters</SheetTitle>
                {sidebar}
              </SheetContent>
            </Sheet>
          </div>

          <div className="px-4 pb-10 sm:px-6">
            {!listing ? (
              <>
                <h2 className="pb-3 pt-2 text-2xl">Browse</h2>

                {/* Browsing by station or artist is the point of this screen,
                    but the whole catalogue should stay one tap away. The rail
                    carries this on desktop, so it only appears below lg. */}
                <button
                  onClick={() => {
                    setSelected({});
                    setQuery("");
                    setShowList(true);
                  }}
                  className="mb-4 flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.05] p-3 text-left transition hover:bg-white/[0.09] lg:hidden"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
                    <ListMusic className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">All songs</span>
                    <span className="block text-xs text-muted-foreground">
                      {catalogue.songs.length.toLocaleString()} tracks · shuffle or search
                    </span>
                  </span>
                  <Play className="size-4 shrink-0 fill-current text-muted-foreground" />
                </button>

                <BrowseGrid
                  catalogue={catalogue}
                  scrollParent={scrollEl}
                  onPick={toggle}
                  onPlay={playFacet}
                />
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-end justify-between gap-3 pb-4 pt-2">
                  <div className="min-w-0">
                    <h2 className="truncate text-2xl">{heading}</h2>
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
                  <SongList
                    catalogue={catalogue}
                    songs={results}
                    filterKey={filterKey}
                    currentId={current}
                    playing={playing}
                    scrollParent={scrollEl}
                    onPlay={play}
                  />
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
        onUnplayable={handleUnplayable}
        ambient={ambient}
        onToggleAmbient={() => setAmbient((v) => !v)}
      />

      <InstallPrompt />
    </div>
  );
}
