"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Play, Shuffle, X } from "lucide-react";
import { CatalogueGate } from "@/components/catalogue-gate";
import { FacetPanel } from "@/components/facet-panel";
import { useFrame } from "@/components/app-frame";
import { usePlayer } from "@/components/player-provider";
import { SongList } from "@/components/song-list";
import { filterSongs, type Catalogue } from "@/lib/catalogue";
import { useCatalogue } from "@/lib/queries";

export default function SongsPage() {
  const { data: catalogue, isLoading, isError, error } = useCatalogue();
  const { scrollEl, filterSlot, query } = useFrame();
  const [selected, setSelected] = useState<Record<string, Set<number>>>({});
  const { currentId, playing, play, playFirst, playRandom, setQueue } = usePlayer();

  const results = useMemo(
    () => (catalogue ? filterSongs(catalogue, selected, query) : []),
    [catalogue, selected, query]
  );

  // The player advances through whatever this route is showing.
  useEffect(() => setQueue(results), [results, setQueue]);

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
  }, [filterKey, scrollEl]);

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

  const chips = useMemo(() => {
    if (!catalogue) return [];
    return Object.entries(selected).flatMap(([facet, set]) =>
      [...set].map((index) => ({
        facet,
        index,
        label: catalogue.facets[facet as keyof Catalogue["facets"]][index],
      }))
    );
  }, [catalogue, selected]);

  return (
    <CatalogueGate isLoading={isLoading} isError={isError} error={error}>
      {catalogue && (
        <>
          {/* The rail belongs to the layout, so the panel is portalled into the
              slot it exposes rather than passed up through props. */}
          {filterSlot &&
            createPortal(
              <FacetPanel
                catalogue={catalogue}
                results={results}
                selected={selected}
                onToggle={toggle}
                onClear={() => setSelected({})}
              />,
              filterSlot
            )}

          <div className="flex flex-wrap items-end justify-between gap-3 pb-4">
            <div className="min-w-0">
              <h2 className="truncate pt-1 text-2xl leading-tight">
                {query.trim() ? `Results for “${query}”` : "All songs"}
              </h2>
              <p className="text-xs text-muted-foreground">
                {results.length.toLocaleString()} songs
              </p>
            </div>
            {results.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => playRandom(results)}
                  title="Shuffle"
                  className="grid size-10 place-items-center rounded-full border border-white/15 transition hover:bg-white/10"
                >
                  <Shuffle className="size-4" />
                </button>
                <button
                  onClick={() => playFirst(results)}
                  title="Play"
                  className="grid size-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:scale-105"
                >
                  <Play className="size-5 translate-x-px fill-current" />
                </button>
              </div>
            )}
          </div>

          {chips.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pb-4">
              {chips.map((chip) => (
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
            <p className="py-20 text-center text-sm text-muted-foreground">
              Nothing matches those filters.
            </p>
          ) : (
            <SongList
              catalogue={catalogue}
              songs={results}
              filterKey={filterKey}
              currentId={currentId}
              playing={playing}
              scrollParent={scrollEl}
              onPlay={play}
            />
          )}
        </>
      )}
    </CatalogueGate>
  );
}
