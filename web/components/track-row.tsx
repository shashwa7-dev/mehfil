"use client";

import { Pause, Play } from "lucide-react";
import { artwork, type Song } from "@/lib/catalogue";
import { LikeButton } from "@/components/like-button";

/** Bars that animate only for the row currently playing. */
function NowPlayingBars() {
  return (
    <span className="flex h-3.5 items-end gap-[2px]" aria-label="Playing">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="w-[3px] animate-pulse rounded-sm bg-primary"
          style={{ height: "100%", animationDelay: `${delay}ms`, animationDuration: "900ms" }}
        />
      ))}
    </span>
  );
}

export function TrackRow({
  song,
  index,
  active,
  playing,
  onPlay,
}: {
  song: Song;
  index: number;
  active: boolean;
  playing: boolean;
  onPlay: () => void;
}) {
  return (
    <div
      onClick={onPlay}
      onKeyDown={(e) => {
        // Only the row's own keystrokes. The heart nested inside is a real
        // button with its own Enter and Space handling, and without this the
        // row would preventDefault its activation and start the song instead.
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPlay();
        }
      }}
      role="button"
      tabIndex={0}
      className={`group grid cursor-default grid-cols-[1.5rem_2.5rem_1fr_auto] items-center gap-2.5 rounded-md px-1 py-1.5 outline-none transition-colors hover:bg-white/[0.06] focus-visible:bg-white/[0.08] sm:gap-3 sm:px-2 ${
        active ? "bg-white/[0.07]" : ""
      }`}
    >
      {/* Index swaps to a play control on hover. */}
      <div className="grid size-6 place-items-center text-xs tabular-nums text-muted-foreground">
        {active && playing ? (
          <span className="group-hover:hidden">
            <NowPlayingBars />
          </span>
        ) : (
          <span className="group-hover:hidden">{index + 1}</span>
        )}
        <span className="hidden group-hover:block">
          {active && playing ? (
            <Pause className="size-3.5 fill-current text-foreground" />
          ) : (
            <Play className="size-3.5 fill-current text-foreground" />
          )}
        </span>
      </div>

      <img
        src={artwork(song.video)}
        alt=""
        loading="lazy"
        className="size-10 rounded object-cover"
      />

      <div className="min-w-0">
        <div
          className={`truncate text-sm ${active ? "font-medium text-primary" : "text-foreground"}`}
        >
          {song.title}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {song.artists.join(", ") || "Unknown artist"}
          {song.film ? ` · ${song.film}` : ""}
        </div>
      </div>

      <div className="flex items-center gap-3 pr-1">
        {song.moods.slice(0, 1).map((mood) => (
          <span
            key={mood}
            className="hidden rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-muted-foreground lg:inline"
          >
            {mood}
          </span>
        ))}
        {song.confidence < 0.85 && (
          <span
            title="Matched on singer alone — may not be the catalogue recording"
            className="hidden size-1.5 rounded-full bg-primary/60 sm:block"
          />
        )}
        <LikeButton songId={song.id} size={15} className="size-7" />
      </div>
    </div>
  );
}
