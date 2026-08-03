"use client";

import { useEffect, useMemo, useState } from "react";
import { Play } from "lucide-react";
import {
  artwork,
  facetCards,
  portrait,
  PERSON_FACETS,
  type Catalogue,
  type PhotoManifest,
} from "@/lib/catalogue";

// Order matters: this is the browse order on the home screen.
const TABS: { facet: string; label: string; round?: boolean }[] = [
  { facet: "stations", label: "Stations" },
  { facet: "artists", label: "Singers", round: true },
  { facet: "composer", label: "Composers", round: true },
  { facet: "lyricist", label: "Lyricists", round: true },
  { facet: "actor", label: "On screen", round: true },
  { facet: "films", label: "Films" },
];

const INITIAL = 36;

export function BrowseGrid({
  catalogue,
  onPick,
  onPlay,
}: {
  catalogue: Catalogue;
  onPick: (facet: string, index: number) => void;
  onPlay: (facet: string, index: number) => void;
}) {
  const [tab, setTab] = useState(TABS[0]);
  const [limit, setLimit] = useState(INITIAL);
  const [photos, setPhotos] = useState<PhotoManifest | null>(null);

  useEffect(() => {
    fetch("/artists/manifest.json")
      .then((r) => (r.ok ? r.json() : null))
      .then(setPhotos)
      .catch(() => setPhotos(null)); // no manifest yet: fall back to song art
  }, []);

  const cards = useMemo(() => facetCards(catalogue, tab.facet), [catalogue, tab]);
  const visible = cards.slice(0, limit);
  const isPerson = PERSON_FACETS.has(tab.facet);

  return (
    <div>
      <div className="scroll-slim -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-4">
        {TABS.map((t) => {
          const on = t.facet === tab.facet;
          return (
            <button
              key={t.facet}
              onClick={() => {
                setTab(t);
                setLimit(INITIAL);
              }}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                on
                  ? "bg-primary text-primary-foreground"
                  : "bg-white/[0.07] text-foreground/80 hover:bg-white/[0.12]"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {visible.map((card) => (
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
                src={(isPerson && portrait(card.label, photos)) || artwork(card.video)}
                alt=""
                loading="lazy"
                // A portrait is a real face, so keep the head in frame; song
                // stills are landscape and crop better from the centre.
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

      {limit < cards.length && (
        <div className="pt-6 text-center">
          <button
            onClick={() => setLimit((n) => n + INITIAL)}
            className="rounded-full border border-white/15 px-4 py-2 text-xs text-muted-foreground transition hover:border-white/30 hover:text-foreground"
          >
            Show more ({(cards.length - limit).toLocaleString()} left)
          </button>
        </div>
      )}
    </div>
  );
}
