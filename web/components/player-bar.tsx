"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  Loader2,
  Maximize2,
  Pause,
  Play,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
  Sparkles,
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
  getIframe?(): HTMLIFrameElement | null;
  destroy?(): void;
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

// Only some failures are worth retrying. 100/101/150 are deterministic
// refusals — the video is gone, or its owner disallows embedding — and will
// fail identically every time, so retrying only delays the skip. Code 5 is a
// browser-side player failure, and a stall is usually a network hiccup; both
// often clear on a second attempt.
const RETRYABLE_CODES = new Set([5]);
const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = [600, 1800];

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
  ambient,
  onToggleAmbient,
}: {
  song: Song | null;
  shuffle: boolean;
  repeat: boolean;
  ambient: boolean;
  onToggleAmbient: () => void;
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
  const [expanded, setExpanded] = useState(false);
  // The video layer portals to <body>, which only exists after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
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

  // Attempts spent on the song currently loaded, reset whenever it changes.
  const attemptsRef = useRef(0);
  const retryTimerRef = useRef<number | null>(null);
  const [retrying, setRetrying] = useState(0);

  /**
   * Single funnel for every failure: retry the ones that can plausibly
   * succeed on a second try, give up immediately on the ones that cannot.
   */
  const handleFailure = useRef<(reason: string, retryable: boolean) => void>(() => {});
  handleFailure.current = (reason, retryable) => {
    const failed = songRef.current;
    if (!failed) return;

    if (retryable && attemptsRef.current < MAX_ATTEMPTS) {
      const delay = RETRY_BACKOFF_MS[attemptsRef.current - 1] ?? 1800;
      attemptsRef.current += 1;
      setRetrying(attemptsRef.current);
      setFailure(`${reason} — retrying`);
      retryTimerRef.current = window.setTimeout(() => {
        // The song may have changed while the retry was pending.
        if (songRef.current?.id !== failed.id) return;
        setFailure(null);
        setLoading(true);
        playerRef.current?.loadVideoById(failed.video);
      }, delay);
      return;
    }

    setLoading(false);
    setPlaying(false);
    setRetrying(0);
    playingRef.current(false);
    setFailure(reason);
    unplayableRef.current(failed.id, reason);
  };

  useEffect(() => {
    // hostRef lives inside the portal, so there is nothing to attach to until
    // the portal has rendered.
    if (!mounted) return;
    let cancelled = false;
    loadYouTubeAPI().then(() => {
      if (cancelled || !hostRef.current) return;
      // A player whose iframe has been detached is unrecoverable: every call
      // silently does nothing and the UI waits forever. `playerRef` being set
      // is not proof the player is alive, so check the iframe is still in the
      // document and rebuild if it is not.
      if (playerRef.current) {
        const iframe = playerRef.current.getIframe?.();
        if (iframe && document.contains(iframe)) return;
        playerRef.current.destroy?.();
        playerRef.current = null;
        setReady(false);
      }
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
            handleFailure.current(reason, RETRYABLE_CODES.has(event.data));
          },
        },
      });
    });
    return () => {
      cancelled = true;
    };
  }, [mounted]);

  useEffect(() => {
    if (!ready || !song || !playerRef.current) return;
    // A new song gets a fresh attempt budget, and any pending retry for the
    // previous one is abandoned.
    if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
    attemptsRef.current = 1;
    setRetrying(0);
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
      // A stall is usually a network hiccup rather than a dead video, so it
      // gets the same retry budget as a browser-side player error.
      handleFailure.current("Timed out — the video never started", true);
    }, STALL_MS);
    return () => window.clearTimeout(timer);
  }, [loading, song, retrying]);

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

  // Escape closes the expanded view, matching every other overlay on the web.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

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

  // Rendered in both the bar and the expanded view, so the controls are always
  // reachable. `large` scales it up for the full-screen layout.
  const transport = (large: boolean) => (
    <div className="flex w-full flex-col items-center gap-1">
      <div className={`flex items-center ${large ? "gap-4" : "gap-2"}`}>
        <button
          onClick={onToggleShuffle}
          title="Shuffle"
          className={`${iconButton} ${shuffle ? "text-primary hover:text-primary" : ""}`}
        >
          <Shuffle className={large ? "size-5" : "size-4"} />
        </button>
        <button onClick={onPrev} disabled={!song} className={iconButton} title="Previous">
          <SkipBack className={`fill-current ${large ? "size-5" : "size-4"}`} />
        </button>
        <button
          onClick={toggle}
          disabled={!song || !ready}
          title={playing ? "Pause" : "Play"}
          className={`grid place-items-center rounded-full bg-foreground text-background transition hover:scale-105 disabled:opacity-40 disabled:hover:scale-100 ${
            large ? "size-12" : "size-9"
          }`}
        >
          {loading ? (
            <Loader2 className={`animate-spin ${large ? "size-5" : "size-4"}`} />
          ) : playing ? (
            <Pause className={`fill-current ${large ? "size-5" : "size-4"}`} />
          ) : (
            <Play className={`translate-x-px fill-current ${large ? "size-5" : "size-4"}`} />
          )}
        </button>
        <button onClick={onNext} disabled={!song} className={iconButton} title="Next">
          <SkipForward className={`fill-current ${large ? "size-5" : "size-4"}`} />
        </button>
        <button
          onClick={onToggleRepeat}
          title="Repeat one"
          className={`${iconButton} ${repeat ? "text-primary hover:text-primary" : ""}`}
        >
          <Repeat className={large ? "size-5" : "size-4"} />
        </button>
      </div>

      <div
        className={`w-full items-center gap-2 ${
          large ? "flex max-w-2xl pt-1" : "hidden max-w-md md:flex"
        }`}
      >
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
  );

  /**
   * The video always lives in a portal on <body>.
   *
   * It cannot live in the footer: `backdrop-blur` there makes the footer a
   * containing block for fixed-position descendants, so a "full screen"
   * overlay would resolve against the bar and hang off the bottom. And the
   * portal must be unconditional — toggling it would move the node, tearing
   * down the iframe and restarting the song.
   */
  const videoLayer = (
    <div
      className={
        expanded
          ? "fixed inset-0 z-[70] flex flex-col overflow-hidden bg-background"
          : "pointer-events-none fixed -left-[9999px] top-0 h-36 w-64 overflow-hidden"
      }
    >
      {/* Ambient wash. The iframe is cross-origin so its frames cannot be
          sampled to a canvas, but a heavily blurred copy of the thumbnail
          gives the same bloom for nothing — no pixel access, no timers. */}
      {expanded && ambient && song && (
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <img
            key={song.video}
            src={artwork(song.video, "hq")}
            alt=""
            className="absolute left-1/2 top-1/2 h-[135%] w-[135%] -translate-x-1/2 -translate-y-1/2 object-cover opacity-60 blur-[100px] saturate-[1.8] transition-opacity duration-700"
          />
          {/* Keeps text legible over whatever the artwork happens to be, while
              leaving the middle open so the video sits inside its own glow. */}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/55 to-background/35" />
        </div>
      )}

      {expanded && (
        <div className="flex shrink-0 items-center justify-between px-5 py-4">
          <span className="text-[11px] uppercase tracking-widest text-muted-foreground">
            Now playing
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={onToggleAmbient}
              title={ambient ? "Ambient mode on" : "Ambient mode off"}
              className={`rounded-full p-2 transition hover:bg-white/10 ${
                ambient ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Sparkles className="size-4" />
            </button>
            <button
              onClick={() => setExpanded(false)}
              title="Collapse"
              className="rounded-full p-2 text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
            >
              <ChevronDown className="size-5" />
            </button>
          </div>
        </div>
      )}

      <div
        className={
          expanded
            ? "flex min-h-0 flex-1 items-center justify-center px-5 py-2"
            : "size-full"
        }
      >
        {/* Height-driven rather than width-driven: `h-full` takes the space the
            flex row actually has and `aspect-video` derives the width from it,
            with max-w capping it on wide screens. Sizing by width instead lets
            a short viewport push the 16:9 height into the text below it. */}
        {/* clip-path rather than overflow-hidden: border-radius alone does not
            reliably clip a nested iframe in WebKit, which leaves square
            corners poking out of the rounded container. */}
        <div
          className={
            expanded
              ? "aspect-video h-full max-w-4xl rounded-xl bg-black [clip-path:inset(0_round_0.75rem)]"
              : "size-full"
          }
        >
          <div ref={hostRef} className="size-full" />
        </div>
      </div>

      {expanded && (
        <div className="shrink-0 px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-6">
          <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-4">
            {song && (
              <div className="w-full text-center">
                <h2 className="truncate text-2xl">{song.title}</h2>
                <p className="truncate text-sm text-muted-foreground">
                  {song.artists.join(", ") || "Unknown artist"}
                  {song.film ? ` · ${song.film}` : ""}
                </p>
              </div>
            )}
            {transport(true)}
          </div>
        </div>
      )}
    </div>
  );

  // The portal must keep the same position in the returned tree at all times.
  // Returning a different root shape when nothing is playing (a fragment vs a
  // footer) makes React remount the portal's children, which destroys the
  // iframe while playerRef still points at it — the player then appears to
  // load forever. So the root is always this fragment with the portal first,
  // and only the bar below it is conditional.
  return (
    <>
      {mounted && createPortal(videoLayer, document.body)}

      {song && (
        <footer className="z-50 shrink-0 border-t bg-card/80 backdrop-blur">
      <div className="grid h-[72px] grid-cols-[1fr_auto] items-center gap-4 px-4 md:grid-cols-3">
        {/* Now playing. The video host is rendered unconditionally: the player
            is constructed against it on mount, so gating it behind `song`
            would mean the player is never created at all. */}
        <div className="flex min-w-0 items-center gap-3">
          {song && (
            <button
              onClick={() => setExpanded(true)}
              title="Expand to video"
              className="group/art relative size-11 shrink-0 overflow-hidden rounded"
            >
              <img
                src={artwork(song.video)}
                alt=""
                loading="lazy"
                className="size-full object-cover"
              />
              <span className="absolute inset-0 grid place-items-center bg-black/55 text-white opacity-0 transition group-hover/art:opacity-100 group-focus-visible/art:opacity-100">
                <Maximize2 className="size-4" />
              </span>
            </button>
          )}

          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{song.title}</div>
            <div className="truncate text-xs text-muted-foreground">
              {failure ? (
                <span className="text-destructive">{failure}</span>
              ) : loading ? (
                "Loading…"
              ) : (
                song.artists.join(", ") || "Unknown artist"
              )}
            </div>
          </div>
        </div>

        {transport(false)}

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
      )}
    </>
  );
}
