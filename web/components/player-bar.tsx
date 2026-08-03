"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2,
  Pause,
  Play,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import { artwork, type Song } from "@/lib/catalogue";

type YTPlayer = {
  playVideo(): void;
  pauseVideo(): void;
  loadVideoById(id: string): void;
  getCurrentTime(): number;
  getDuration(): number;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setVolume(volume: number): void;
};

declare global {
  interface Window {
    YT?: {
      Player: new (el: HTMLElement | string, opts: Record<string, unknown>) => YTPlayer;
      PlayerState: {
        UNSTARTED: number;
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        CUED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

// YouTube's onError codes. 101 and 150 are the same condition reported two
// ways: the owner has disallowed embedded playback.
const ERROR_TEXT: Record<number, string> = {
  2: "Invalid video id",
  5: "Playback failed in this browser",
  100: "Video removed or private",
  101: "Owner disabled embedding",
  150: "Owner disabled embedding",
};

// A load that never reaches PLAYING is indistinguishable from a slow one
// without a deadline. Long enough not to trip on a genuinely slow network.
const STALL_MS = 15000;

let apiPromise: Promise<void> | null = null;

function loadYouTubeAPI(): Promise<void> {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    if (window.YT?.Player) return resolve();
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    window.onYouTubeIframeAPIReady = () => resolve();
    document.head.appendChild(tag);
  });
  return apiPromise;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Draggable bar used for both seek and volume. */
function Scrubber({
  value,
  onCommit,
  disabled,
  className = "",
}: {
  value: number; // 0..1
  onCommit: (fraction: number) => void;
  disabled?: boolean;
  className?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState(0);

  const fractionAt = useCallback((clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => setPreview(fractionAt(e.clientX));
    const up = (e: PointerEvent) => {
      setDragging(false);
      onCommit(fractionAt(e.clientX));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragging, fractionAt, onCommit]);

  const shown = dragging ? preview : value;

  return (
    <div
      ref={trackRef}
      onPointerDown={(e) => {
        if (disabled) return;
        setDragging(true);
        setPreview(fractionAt(e.clientX));
      }}
      className={`group/scrub relative flex h-3 cursor-pointer items-center ${
        disabled ? "pointer-events-none opacity-50" : ""
      } ${className}`}
    >
      <div className="h-1 w-full overflow-hidden rounded-full bg-white/20">
        <div
          className="h-full rounded-full bg-foreground transition-colors group-hover/scrub:bg-primary"
          style={{ width: `${shown * 100}%` }}
        />
      </div>
      <div
        className={`absolute size-3 -translate-x-1/2 rounded-full bg-foreground shadow transition-opacity ${
          dragging ? "opacity-100" : "opacity-0 group-hover/scrub:opacity-100"
        }`}
        style={{ left: `${shown * 100}%` }}
      />
    </div>
  );
}

export function PlayerBar({
  song,
  shuffle,
  repeat,
  onToggleShuffle,
  onToggleRepeat,
  onNext,
  onPrev,
  onEnded,
  onPlayingChange,
  onUnplayable,
}: {
  song: Song | null;
  shuffle: boolean;
  repeat: boolean;
  onToggleShuffle: () => void;
  onToggleRepeat: () => void;
  onNext: () => void;
  onPrev: () => void;
  onEnded: () => void;
  onPlayingChange: (playing: boolean) => void;
  onUnplayable: (songId: number, reason: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);

  // Keep the latest callbacks without re-creating the player each render.
  const endedRef = useRef(onEnded);
  endedRef.current = onEnded;
  const playingRef = useRef(onPlayingChange);
  playingRef.current = onPlayingChange;
  const unplayableRef = useRef(onUnplayable);
  unplayableRef.current = onUnplayable;
  // The song the player was last told to load, read inside YT callbacks which
  // close over their creation-time scope and would otherwise see a stale song.
  const songRef = useRef<Song | null>(song);
  songRef.current = song;

  useEffect(() => {
    let cancelled = false;
    loadYouTubeAPI().then(() => {
      if (cancelled || !hostRef.current || playerRef.current) return;
      playerRef.current = new window.YT!.Player(hostRef.current, {
        height: "100%",
        width: "100%",
        playerVars: { autoplay: 0, controls: 0, rel: 0, playsinline: 1 },
        events: {
          onReady: () => setReady(true),
          onStateChange: (event: { data: number }) => {
            const state = window.YT!.PlayerState;
            if (event.data === state.ENDED) endedRef.current();

            const isPlaying = event.data === state.PLAYING;
            setPlaying(isPlaying);
            playingRef.current(isPlaying);

            // Buffering and unstarted both mean "not audible yet". Anything
            // else means the load resolved one way or the other.
            setLoading(
              event.data === state.BUFFERING || event.data === state.UNSTARTED
            );
            if (isPlaying) setFailure(null);
          },
          // Without this a refused video is indistinguishable from a slow one:
          // the bar simply sits at 0:00 forever.
          onError: (event: { data: number }) => {
            const reason = ERROR_TEXT[event.data] ?? `Playback error ${event.data}`;
            setLoading(false);
            setPlaying(false);
            playingRef.current(false);
            setFailure(reason);
            const failed = songRef.current;
            if (failed) unplayableRef.current(failed.id, reason);
          },
        },
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || !song || !playerRef.current) return;
    playerRef.current.loadVideoById(song.video);
    setElapsed(0);
    setDuration(0);
    setFailure(null);
    setLoading(true);
  }, [ready, song?.video]);

  // Some failures never fire onError -- the player just never starts. Give the
  // load a deadline so it reports rather than hanging at 0:00 indefinitely.
  useEffect(() => {
    if (!loading || !song) return;
    const timer = window.setTimeout(() => {
      if (playerRef.current && playerRef.current.getCurrentTime() > 0) return;
      const reason = "Timed out — the video never started";
      setLoading(false);
      setFailure(reason);
      unplayableRef.current(song.id, reason);
    }, STALL_MS);
    return () => window.clearTimeout(timer);
  }, [loading, song]);

  useEffect(() => {
    playerRef.current?.setVolume(muted ? 0 : Math.round(volume * 100));
  }, [volume, muted, ready]);

  // The IFrame API emits no time events, so poll while playing.
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      setElapsed(player.getCurrentTime());
      setDuration(player.getDuration());
    }, 400);
    return () => window.clearInterval(id);
  }, [playing]);

  const toggle = () => {
    const player = playerRef.current;
    if (!player) return;
    if (playing) player.pauseVideo();
    else player.playVideo();
  };

  const seek = useCallback(
    (fraction: number) => {
      const player = playerRef.current;
      if (!player || duration <= 0) return;
      player.seekTo(fraction * duration, true);
      setElapsed(fraction * duration);
    },
    [duration]
  );

  const iconButton =
    "grid size-8 place-items-center rounded-full text-muted-foreground transition hover:text-foreground disabled:opacity-40 disabled:hover:text-muted-foreground";

  return (
    <footer className="z-50 shrink-0 border-t bg-card/80 backdrop-blur">
      {/* The iframe must remain mounted to keep audio playing; park it offscreen. */}
      <div className="pointer-events-none absolute -left-[9999px] size-1 overflow-hidden">
        <div ref={hostRef} />
      </div>

      <div className="grid h-[72px] grid-cols-[1fr_auto] items-center gap-4 px-4 md:grid-cols-3">
        {/* Now playing */}
        <div className="flex min-w-0 items-center gap-3">
          {song ? (
            <>
              <img
                src={artwork(song.video)}
                alt=""
                className="size-11 shrink-0 rounded object-cover"
                loading="lazy"
              />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{song.title}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {failure ? (
                    <span className="text-destructive">{failure} — skipping</span>
                  ) : loading ? (
                    "Loading…"
                  ) : (
                    song.artists.join(", ") || "Unknown artist"
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="text-xs text-muted-foreground">Nothing playing</div>
          )}
        </div>

        {/* Transport */}
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-2">
            <button
              onClick={onToggleShuffle}
              title="Shuffle"
              className={`${iconButton} ${shuffle ? "text-primary hover:text-primary" : ""}`}
            >
              <Shuffle className="size-4" />
            </button>
            <button onClick={onPrev} disabled={!song} className={iconButton} title="Previous">
              <SkipBack className="size-4 fill-current" />
            </button>
            <button
              onClick={toggle}
              disabled={!song || !ready}
              title={playing ? "Pause" : "Play"}
              className="grid size-9 place-items-center rounded-full bg-foreground text-background transition hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : playing ? (
                <Pause className="size-4 fill-current" />
              ) : (
                <Play className="size-4 translate-x-px fill-current" />
              )}
            </button>
            <button onClick={onNext} disabled={!song} className={iconButton} title="Next">
              <SkipForward className="size-4 fill-current" />
            </button>
            <button
              onClick={onToggleRepeat}
              title="Repeat one"
              className={`${iconButton} ${repeat ? "text-primary hover:text-primary" : ""}`}
            >
              <Repeat className="size-4" />
            </button>
          </div>

          <div className="hidden w-full max-w-md items-center gap-2 md:flex">
            <span className="w-9 text-right text-[11px] tabular-nums text-muted-foreground">
              {formatTime(elapsed)}
            </span>
            <Scrubber
              value={duration > 0 ? elapsed / duration : 0}
              onCommit={seek}
              disabled={!song || duration <= 0}
              className="flex-1"
            />
            <span className="w-9 text-[11px] tabular-nums text-muted-foreground">
              {formatTime(duration)}
            </span>
          </div>
        </div>

        {/* Volume */}
        <div className="hidden items-center justify-end gap-2 md:flex">
          {song && song.confidence < 0.85 && (
            <span
              title="Matched on singer alone — this may not be the catalogue recording"
              className="rounded border border-primary/40 px-1.5 py-0.5 text-[10px] text-primary"
            >
              unverified
            </span>
          )}
          <button onClick={() => setMuted((m) => !m)} className={iconButton} title="Mute">
            {muted || volume === 0 ? (
              <VolumeX className="size-4" />
            ) : (
              <Volume2 className="size-4" />
            )}
          </button>
          <Scrubber
            value={muted ? 0 : volume}
            onCommit={(f) => {
              setVolume(f);
              setMuted(false);
            }}
            className="w-24"
          />
        </div>
      </div>
    </footer>
  );
}
