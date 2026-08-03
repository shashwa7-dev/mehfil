"use client";

import { useMemo, useState } from "react";
import { VirtuosoGrid } from "react-virtuoso";
import { Play } from "lucide-react";
import {
  artwork,
  facetCards,
  portrait,
  PERSON_FACETS,
  type Catalogue,
  type FacetCard,
} from "@/lib/catalogue";
import { StationPoster } from "@/components/station-poster";
import {
  flattenPages,
  usePagedItems,
  usePhotoManifest,
  useStationPosters,
} from "@/lib/queries";

const TABS: { facet: string; label: string; round?: boolean }[] = [
  { facet: "stations", label: "Stations" },
  { facet: "artists", label: "Singers", round: true },
  { facet: "composer", label: "Composers", round: true },
  { facet: "lyricist", label: "Lyricists", round: true },
  { facet: "actor", label: "On screen", round: true },
  { facet: "films", label: "Films" },
];

export function BrowseGrid({
  catalogue,
  scrollParent,
  onPick,
  onPlay,
}: {
  catalogue: Catalogue;
  scrollParent: HTMLElement | null;
  onPick: (facet: string, index: number) => void;
  onPlay: (facet: string, index: number) => void;
}) {
  const [tab, setTab] = useState(TABS[0]);
  const { data: photos } = usePhotoManifest();
  const { data: posters } = useStationPosters();

  const cards = useMemo(() => facetCards(catalogue, tab.facet), [catalogue, tab]);
  const paged = usePagedItems(cards, tab.facet);
  const loaded = useMemo(() => flattenPages<FacetCard>(paged.data?.pages), [paged.data]);

  const isPerson = PERSON_FACETS.has(tab.facet);
  const isStation = tab.facet === "stations";

  return (
    <div>
      {/* Negative margin lets the strip run to the container edges so the fade
          sits where the content actually gets clipped. */}
      <div className="no-scrollbar fade-x -mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
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

      {scrollParent && (
        <VirtuosoGrid
          customScrollParent={scrollParent}
          data={loaded}
          // Columns come from CSS rather than measurement, so the layout stays
          // responsive without tracking container width by hand.
          listClassName="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
          endReached={() => {
            if (paged.hasNextPage && !paged.isFetchingNextPage) paged.fetchNextPage();
          }}
          increaseViewportBy={{ top: 0, bottom: 800 }}
          computeItemKey={(_, card) => `${tab.facet}-${card.index}`}
          itemContent={(_, card) => (
            <div
              onClick={() => onPick(tab.facet, card.index)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onPick(tab.facet, card.index);
                }
              }}
              role="button"
              tabIndex={0}
              className="group relative h-full cursor-pointer rounded-lg bg-white/[0.04] p-3 outline-none transition hover:bg-white/[0.09] focus-visible:bg-white/[0.09]"
            >
              <div className="relative mb-3">
                {isStation ? (
                  <StationPoster
                    name={card.label}
                    meta={catalogue.stationMeta?.[card.label]}
                    photos={photos ?? null}
                    poster={posters?.[card.label]?.file}
                    video={card.video}
                  />
                ) : (
                  <img
                    src={
                      (isPerson && portrait(card.label, photos ?? null)) || artwork(card.video)
                    }
                    alt=""
                    loading="lazy"
                    className={`aspect-square w-full object-cover shadow-lg ${
                      tab.round ? "rounded-full object-top" : "rounded-md"
                    }`}
                  />
                )}
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
          )}
        />
      )}
    </div>
  );
}
