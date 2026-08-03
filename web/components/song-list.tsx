"use client";

import { useEffect, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { TrackRow } from "@/components/track-row";
import { hydrate, type Catalogue, type RawSong } from "@/lib/catalogue";
import { flattenPages, usePagedItems } from "@/lib/queries";

const ROW_HEIGHT = 56;
// Rows rendered beyond the viewport. Enough to cover a fast flick without
// painting the whole catalogue.
const OVERSCAN = 8;
// How close to the end of loaded rows before pulling the next page.
const PREFETCH_ROWS = 20;

export function SongList({
  catalogue,
  songs,
  filterKey,
  currentId,
  playing,
  scrollRef,
  onPlay,
}: {
  catalogue: Catalogue;
  songs: RawSong[];
  filterKey: string;
  currentId: number | null;
  playing: boolean;
  scrollRef: React.RefObject<HTMLElement | null>;
  onPlay: (id: number) => void;
}) {
  const paged = usePagedItems(songs, filterKey);
  const loaded = useMemo(() => flattenPages(paged.data?.pages), [paged.data]);

  const virtualizer = useVirtualizer({
    count: loaded.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  });

  const virtualRows = virtualizer.getVirtualItems();
  const lastVisible = virtualRows.at(-1)?.index ?? 0;

  // Reveal the next page as the user approaches the end of what is loaded.
  // This replaces a "load more" button: scrolling is the only trigger.
  useEffect(() => {
    if (
      paged.hasNextPage &&
      !paged.isFetchingNextPage &&
      lastVisible >= loaded.length - PREFETCH_ROWS
    ) {
      paged.fetchNextPage();
    }
  }, [lastVisible, loaded.length, paged]);

  if (songs.length === 0) return null;

  return (
    <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
      {virtualRows.map((row) => {
        const raw = loaded[row.index];
        if (!raw) return null;
        const song = hydrate(raw, catalogue.facets);
        return (
          <div
            key={song.id}
            data-index={row.index}
            ref={virtualizer.measureElement}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${row.start}px)`,
            }}
          >
            <TrackRow
              song={song}
              index={row.index}
              active={song.id === currentId}
              playing={playing}
              onPlay={() => onPlay(song.id)}
            />
          </div>
        );
      })}
    </div>
  );
}
