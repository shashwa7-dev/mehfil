"use client";

import { Heart } from "lucide-react";
import { burstAt } from "@/components/like-burst";
import { isFavourite, toggleFavourite, useIsFavourite } from "@/lib/favourites";

/**
 * The one control that likes a song.
 *
 * Always rendered rather than revealed on hover, so nothing shifts when the
 * state changes and it is reachable on a phone, where there is no hover to
 * reveal anything.
 */
export function LikeButton({
  songId,
  className = "",
  size = 16,
}: {
  songId: number;
  className?: string;
  size?: number;
}) {
  const liked = useIsFavourite(songId);

  return (
    <button
      type="button"
      aria-pressed={liked}
      aria-label={liked ? "Remove from favourites" : "Add to favourites"}
      title={liked ? "Remove from favourites" : "Add to favourites"}
      onClick={(event) => {
        // Rows are themselves play buttons, and the expanded player closes on
        // background clicks. Without both of these, liking would also start a
        // song or dismiss the view it was pressed in.
        event.stopPropagation();
        event.preventDefault();

        // Read before toggling: the burst celebrates liking, and firing it on
        // removal would read as mockery.
        const willLike = !isFavourite(songId);
        toggleFavourite(songId);

        if (willLike) {
          const box = event.currentTarget.getBoundingClientRect();
          burstAt(box.left + box.width / 2, box.top + box.height / 2);
        }
      }}
      className={`grid shrink-0 place-items-center rounded-full transition active:scale-90 ${
        liked
          ? "text-primary"
          : "text-muted-foreground hover:text-foreground"
      } ${className}`}
    >
      <Heart
        style={{ width: size, height: size }}
        // Only the fill animates. Scaling the icon would move it inside a fixed
        // grid cell and shift whatever sits beside it.
        className={`transition-transform duration-200 ${liked ? "fill-current scale-110" : "scale-100"}`}
      />
    </button>
  );
}
