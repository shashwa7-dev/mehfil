"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Play } from "lucide-react";
import {
  artwork,
  facetCards,
  portrait,
  PERSON_FACETS,
  type Catalogue,
  type FacetCard,
} from "@/lib/catalogue";
import { flattenPages, usePagedItems, usePhotoManifest } from "@/lib/queries";

const TABS: { facet: string; label: string; round?: boolean }[] = [
  { facet: "stations", label: "Stations" },
  { facet: "artists", label: "Singers", round: true },
  { facet: "composer", label: "Composers", round: true },
  { facet: "lyricist", label: "Lyricists", round: true },
  { facet: "actor", label: "On screen", round: true },
  { facet: "films", label: "Films" },
];

const CARD_MIN = 170;
const GAP = 12;
const ROW_HEIGHT = 232;
const PREFETCH_ROWS = 3;

/** Column count from the container width, so virtual rows match the CSS grid. */
function useColumnCount(ref: React.RefObject<HTMLDivElement | null>) {
  const [columns, setColumns] = useState(4);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const width = element.clientWidth;
      setColumns(Math.max(1, Math.floor((width + GAP) / (CARD_MIN + GAP))));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return columns;
}

export function BrowseGrid({
  catalogue,
  scrollRef,
  onPick,
  onPlay,
}: {
  catalogue: Catalogue;
  scrollRef: React.RefObject<HTMLElement | null>;
  onPick: (facet: string, index: number) => void;
  onPlay: (facet: string, index: number) => void;
}) {
  const [tab, setTab] = useState(TABS[0]);
  const gridRef = useRef<HTMLDivElement>(null);
  const columns = useColumnCount(gridRef);
  const { data: photos } = usePhotoManifest();

  const cards = useMemo(() => facetCards(catalogue, tab.facet), [catalogue, tab]);
  const paged = usePagedItems(cards, tab.facet);
  const loaded = useMemo(() => flattenPages<FacetCard>(paged.data?.pages), [paged.data]);

  const rowCount = Math.ceil(loaded.length / columns);
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 3,
  });

  const virtualRows = virtualizer.getVirtualItems();
  const lastRow = virtualRows.at(-1)?.index ?? 0;

  useEffect(() => {
    if (paged.hasNextPage && !paged.isFetchingNextPage && lastRow >= rowCount - PREFETCH_ROWS) {
      paged.fetchNextPage();
    }
  }, [lastRow, rowCount, paged]);

  const isPerson = PERSON_FACETS.has(tab.facet);

  return (
    <div>
      <div className="scroll-slim -mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1">
        {TABS.map((t) => (
          <button
            key={t.facet}
            onClick={() => setTab(t)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
              t.facet === tab.facet
                ? "bg-primary text-primary-foreground"
                : "bg-white/[0.07] text-foreground/80 hover:bg-white/[0.12]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div ref={gridRef} style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualRows.map((row) => {
          const start = row.index * columns;
          const rowCards = loaded.slice(start, start + columns);
          return (
            <div
              key={row.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${row.start}px)`,
                display: "grid",
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                gap: GAP,
                paddingBottom: GAP,
              }}
            >
              {rowCards.map((card) => (
                <div
                  key={card.index}
                  onClick={() => onPick(tab.facet, card.index)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onPick(tab.facet, card.index);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  className="group relative cursor-pointer rounded-lg bg-white/[0.04] p-3 outline-none transition hover:bg-white/[0.09] focus-visible:bg-white/[0.09]"
                >
                  <div className="relative mb-3">
                    <img
                      src={
                        (isPerson && portrait(card.label, photos ?? null)) ||
                        artwork(card.video)
                      }
                      alt=""
                      loading="lazy"
                      className={`aspect-square w-full object-cover shadow-lg ${
                        tab.round ? "rounded-full object-top" : "rounded-md"
                      }`}
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onPlay(tab.facet, card.index);
                      }}
                      title={`Play ${card.label}`}
                      className="absolute bottom-2 right-2 grid size-10 translate-y-2 place-items-center rounded-full bg-primary text-primary-foreground opacity-0 shadow-xl transition-all group-hover:translate-y-0 group-hover:opacity-100 focus-visible:translate-y-0 focus-visible:opacity-100"
                    >
                      <Play className="size-4 translate-x-px fill-current" />
                    </button>
                  </div>
                  <div className="truncate text-sm font-medium">{card.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {card.count.toLocaleString()} songs
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
