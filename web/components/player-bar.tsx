"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import {
  ChevronDown,
  ChevronUp,
  Flag,
  Loader2,
  Maximize2,
  Pause,
  Play,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
  Sparkles,
  ListVideo,
  Info,
  Volume2,
  VolumeX,
} from "lucide-react";
import { artwork, type Song } from "@/lib/catalogue";
import { ReportDialog } from "@/components/report-dialog";
import { SongDetails } from "@/components/song-details";
import { useCatalogue, useSongCredits } from "@/lib/queries";
import { QueuePanel } from "@/components/queue-panel";

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

// Travel before a drag counts as a swipe rather than a tap.
const SWIPE_THRESHOLD = 60;

/**
 * Vertical swipe detection.
 *
 * Hand-rolled rather than using a drawer library: every one of them unmounts
 * its content when closed, which would tear down the player iframe and stop
 * playback. Only the direction is needed here, not a full drag-to-dismiss.
 */
function useSwipe(onSwipe: (direction: "up" | "down") => void) {
  const start = useRef<{ x: number; y: number } | null>(null);

  return {
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      start.current = { x: t.clientX, y: t.clientY };
    },
    onTouchEnd: (e: React.TouchEvent) => {
      if (!start.current) return;
      const t = e.changedTouches[0];
      const dy = t.clientY - start.current.y;
      const dx = t.clientX - start.current.x;
      start.current = null;
      // Ignore mostly-horizontal drags so this never fights a sideways scroll.
      if (Math.abs(dy) < SWIPE_THRESHOLD || Math.abs(dy) < Math.abs(dx)) return;
      onSwipe(dy < 0 ? "up" : "down");
    },
  };
}

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

/**
 * Seek and volume control.
 *
 * Built on Base UI's slider rather than hand-rolled pointer maths. The custom
 * version never worked on touch: without `touch-action: none` the browser
 * claims the gesture as a scroll and stops sending move events, so a drag
 * registered as a tap. This also brings keyboard and screen-reader support.
 *
 * `dragging` state exists so the displayed position follows the thumb rather
 * than the player, which would otherwise keep overwriting it mid-drag.
 */
function Scrubber({
  value,
  onCommit,
  disabled,
  className = "",
  large = false,
  edge = false,
}: {
  value: number; // 0..1
  onCommit: (fraction: number) => void;
  disabled?: boolean;
  className?: string;
  large?: boolean;
  /** Hairline across the bar's top edge, the way a player's progress reads. */
  edge?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState(0);
  const shown = dragging ? preview : value;

  return (
    <SliderPrimitive.Root
      value={shown * 1000}
      min={0}
      max={1000}
      disabled={disabled}
      thumbAlignment="edge"
      onValueChange={(v) => {
        setDragging(true);
        setPreview((Array.isArray(v) ? v[0] : v) / 1000);
      }}
      onValueCommitted={(v) => {
        setDragging(false);
        onCommit((Array.isArray(v) ? v[0] : v) / 1000);
      }}
      // Width comes entirely from the caller. Defaulting to w-full here made
      // the volume control ignore its own w-24 and stretch across the bar.
      className={className}
    >
      {/* Fixed height, not padding: the track thickens on hover, and without a
          locked height that growth reflows everything above the bar. The extra
          height is also the real hit target — the finger and cursor land here,
          not on the thin visible track. */}
      <SliderPrimitive.Control
        className={`group/scrub relative flex w-full cursor-pointer touch-none select-none data-disabled:cursor-not-allowed data-disabled:opacity-50 ${
          // The edge variant hugs the top of its hit area, so the visible line
          // sits on the bar's border while the grab target extends below it.
          edge ? "h-3 items-start" : `items-center ${large ? "h-9" : "h-8"}`
        }`}
      >
        <SliderPrimitive.Track
          className={`relative w-full grow overflow-hidden transition-all ${
            edge
              ? "h-[3px] bg-white/15 group-hover/scrub:h-[5px]"
              : `rounded-full bg-white/25 ${
                  large ? "h-2 group-hover/scrub:h-2.5" : "h-1.5 group-hover/scrub:h-2"
                }`
          }`}
        >
          <SliderPrimitive.Indicator
            className={`h-full transition-colors ${
              edge
                ? "bg-primary"
                : "rounded-full bg-foreground group-hover/scrub:bg-primary"
            }`}
          />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          className={`block shrink-0 cursor-grab rounded-full shadow transition-opacity after:absolute after:-inset-3 active:cursor-grabbing ${
            edge
              // Centred on the line, half above and half below, which is what
              // it should always have been — it only looked low because the
              // footer was clipping the half above. The control is 12px tall
              // with the track pinned to its top, so a 12px thumb aligned to
              // the start has its centre 6px down while the 3px track's centre
              // is at 1.5px: hence 4.5px up, and a pixel less on hover where
              // the track thickens to 5px. Hidden until pointed at, since a
              // permanent dot on a hairline is clutter.
              ? "size-3 -translate-y-[4.5px] bg-primary opacity-0 group-hover/scrub:-translate-y-[3.5px] group-hover/scrub:opacity-100"
              : `bg-foreground ${large ? "size-4" : "size-3.5"}`
          }`}
        />
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
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
  const [queueOpen, setQueueOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const { data: songCredits } = useSongCredits();
  const credit = song ? songCredits?.[String(song.id)] : undefined;
  const { data: catalogue } = useCatalogue();
  const barSwipe = useSwipe((d) => d === "up" && setExpanded(true));
  const stageSwipe = useSwipe((d) => d === "down" && setExpanded(false));
  // The video layer portals to <body>, which only exists after mount. The
  // extra render this costs is the point: there is no way to know we are on
  // the client during the first one.
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- mount detection
  useEffect(() => setMounted(true), []);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);

  /**
   * Latest values for the YouTube callbacks.
   *
   * Those callbacks are created once, when the player is constructed, and
   * close over that render's scope — so they need a ref to read anything
   * current. The refs are filled in an effect rather than during render:
   * writing to a ref while rendering is not safe under concurrent rendering,
   * where a render can be started and thrown away.
   */
  const endedRef = useRef(onEnded);
  const playingRef = useRef(onPlayingChange);
  const unplayableRef = useRef(onUnplayable);
  const songRef = useRef<Song | null>(song);

  useEffect(() => {
    endedRef.current = onEnded;
    playingRef.current = onPlayingChange;
    unplayableRef.current = onUnplayable;
    songRef.current = song;
  });

  // Attempts spent on the song currently loaded, reset whenever it changes.
  const attemptsRef = useRef(0);
  const retryTimerRef = useRef<number | null>(null);
  const [retrying, setRetrying] = useState(0);

  // A pending retry outliving the component would call into a torn-down
  // player. Cleared on the song change too, but that path never runs on
  // unmount.
  useEffect(
    () => () => {
      if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
    },
    []
  );

  /**
   * Single funnel for every failure: retry the ones that can plausibly
   * succeed on a second try, give up immediately on the ones that cannot.
   */
  const handleFailure = useRef<(reason: string, retryable: boolean) => void>(() => {});

  // Assigned in an effect, not during render: everything it touches is a ref
  // or a setter, so it never needs to be current *within* a render — only by
  // the time a player callback fires, which is always after one.
  useEffect(() => {
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
  });

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

  /**
   * Re-issue the very first load if nothing has started.
   *
   * The API reports ready slightly before it will reliably accept a command,
   * so the first loadVideoById after construction is sometimes swallowed
   * outright — no error, no state change. It only affects the first play of a
   * session, which is exactly the "first song fails, then it's fine" symptom.
   * A single nudge well before the stall deadline recovers it invisibly.
   */
  const nudgedRef = useRef(false);
  useEffect(() => {
    if (!ready || !song || nudgedRef.current) return;
    const timer = window.setTimeout(() => {
      const player = playerRef.current;
      if (!player || nudgedRef.current) return;
      if (player.getCurrentTime() > 0) {
        nudgedRef.current = true;
        return;
      }
      nudgedRef.current = true;
      player.loadVideoById(song.video);
      player.playVideo();
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [ready, song]);

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

  /**
   * Back should close the expanded view, not leave the app.
   *
   * Expanding pushes a history entry, so the system back gesture pops it and
   * collapses instead. Collapsing by any other route (chevron, Escape, swipe)
   * pops that entry itself, so the stack never accumulates.
   */
  useEffect(() => {
    if (!expanded) return;
    // Preserve whatever else is on the entry (the view hook stores its state
    // here too), so popping back to it does not lose the current filters.
    window.history.pushState(
      { ...(window.history.state ?? {}), mehfilPlayer: true },
      ""
    );
    const onPop = () => setExpanded(false);
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // Only unwind the entry we added; if this cleanup ran *because* of a
      // popstate, the entry is already gone.
      if (window.history.state?.mehfilPlayer) window.history.back();
    };
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

  // A faint disc appears under the icon on hover, so the secondary controls
  // acknowledge the pointer without competing with the play button, which is
  // the only one that carries a fill at rest.
  const iconButton =
    "grid size-9 place-items-center rounded-full text-muted-foreground transition-all duration-200 hover:bg-white/[0.08] hover:text-foreground active:scale-90 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground";

  // Rendered in both the bar and the expanded view, so the controls are always
  // reachable. `large` scales it up for the full-screen layout.
  // Only the expanded view uses this now: the compact bar lays its controls
  // out along the left edge instead, so there is no shared shape to abstract.
  const transport = () => (
    <div className="flex w-full flex-col items-center gap-0.5">
      <div className="flex items-center gap-4">
        <button
          onClick={onToggleShuffle}
          title="Shuffle"
          className={`${iconButton} ${shuffle ? "text-primary hover:text-primary" : ""}`}
        >
          <Shuffle className="size-5" />
        </button>
        <button onClick={onPrev} disabled={!song} className={iconButton} title="Previous">
          <SkipBack className="size-5 fill-current" />
        </button>
        <button
          onClick={toggle}
          disabled={!song || !ready}
          title={playing ? "Pause" : "Play"}
          // The one filled control, so it carries the weight: a soft brass ring
          // and a lift on hover rather than a flat disc. active:scale keeps the
          // press physical instead of instantaneous.
          className="grid size-12 place-items-center rounded-full bg-foreground text-background shadow-[0_2px_10px_-2px_rgba(0,0,0,0.5)] ring-1 ring-primary/20 transition-all duration-200 hover:scale-105 hover:shadow-[0_4px_18px_-2px_rgba(214,168,84,0.45)] hover:ring-primary/40 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:hover:scale-100"
        >
          {loading ? (
            <Loader2 className="size-5 animate-spin" />
          ) : playing ? (
            <Pause className="size-5 fill-current" />
          ) : (
            <Play className="size-5 translate-x-px fill-current" />
          )}
        </button>
        <button onClick={onNext} disabled={!song} className={iconButton} title="Next">
          <SkipForward className="size-5 fill-current" />
        </button>
        <button
          onClick={onToggleRepeat}
          title="Repeat one"
          className={`${iconButton} ${repeat ? "text-primary hover:text-primary" : ""}`}
        >
          <Repeat className="size-5" />
        </button>
      </div>

      <div className="flex w-full max-w-2xl items-center gap-2 pt-1">
        <span className="w-9 text-right text-[11px] tabular-nums text-muted-foreground">
          {formatTime(elapsed)}
        </span>
        <Scrubber
          value={duration > 0 ? elapsed / duration : 0}
          onCommit={seek}
          disabled={!song || duration <= 0}
          className="flex-1"
          large
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
      {...(expanded ? stageSwipe : {})}
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
        // Constrained to the same column as the video and the controls below
        // it. Spanning the window pushed these to the far edges of a wide
        // screen, so they read as browser chrome rather than part of the view.
        <div className="relative z-10 mx-auto flex w-full max-w-4xl shrink-0 items-center gap-3 px-4 py-4 sm:px-0">
          {/* Collapse leads, as the way out of a full-screen view. A chevron
              alone was easy to miss against the picture behind it. */}
          <button
            onClick={() => setExpanded(false)}
            title="Collapse"
            className="grid size-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.06] text-foreground/80 backdrop-blur transition hover:bg-white/[0.14] hover:text-foreground"
          >
            <ChevronDown className="size-5" />
          </button>

          <span className="flex-1 truncate text-center text-[11px] uppercase tracking-widest text-muted-foreground">
            Now playing
          </span>

          {/* Labelled and visibly two-state. As a bare icon that only changed
              colour, there was nothing to say it was a toggle, what it
              controlled, or which way it was set. */}
          <button
            onClick={onToggleAmbient}
            role="switch"
            aria-checked={ambient}
            title={ambient ? "Turn ambient off" : "Turn ambient on"}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border py-1.5 pl-2 pr-3 text-[11px] font-medium backdrop-blur transition ${
              ambient
                ? "border-primary/40 bg-primary/20 text-primary"
                : "border-white/10 bg-white/[0.06] text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sparkles
              className={`size-3.5 transition-transform ${ambient ? "scale-110" : ""}`}
            />
            <span className="hidden sm:inline">Ambient</span>
            <span
              className={`ml-0.5 size-1.5 rounded-full transition-colors ${
                ambient ? "bg-primary" : "bg-white/25"
              }`}
            />
          </button>
        </div>
      )}

      <div
        className={
          expanded
            // Padding from the smallest size up, not only from md. The cabinet
            // ran edge to edge on a phone, so its sides were cut off by the
            // viewport rather than sitting within it.
            ? "flex min-h-0 flex-1 items-center justify-center md:px-10 md:py-4"
            : "size-full"
        }
      >
        {/* Below md the stage covers the whole screen (see .video-stage); from
            md it returns to a centred card, height-driven so a short viewport
            shrinks the video rather than pushing it into the text below.
            clip-path rather than overflow-hidden, because border-radius alone
            does not reliably clip a nested iframe in WebKit. */}
        {/* From md the picture sits in a CRT cabinet. The set is a background
            layer and the video is placed over its screen, because the screen in
            the artwork is opaque — putting the video behind would hide it.
            Percentages come from measuring the screen rectangle in the image,
            so the two stay registered at any size.
            Below md the video still covers the whole display: a cabinet around
            a phone-sized picture would leave almost nothing to watch. */}
        {/* The cabinet is sized by its own artwork rather than by a box the
            artwork is fitted into. With object-contain the image letterboxes
            inside whatever box it is given, so the moment a height or width
            limit changed the box's aspect, the image no longer filled it — and
            the screen percentages, which are measured against the box, pointed
            somewhere the screen was not. That is what put the picture outside
            the cabinet. Letting the image define the box makes the two
            impossible to disagree. */}
        {/* Height-driven: the cabinet takes the row's full height and derives
            its width from the artwork's ratio, shrinking only when width is
            the tighter constraint. Sizing it by the image's own width instead
            left it small on a large screen with the spare height showing
            underneath. */}
        <div
          className={
            expanded
              ? "video-stage absolute inset-0 bg-black md:relative md:inset-auto md:aspect-[768/484] md:h-full md:max-w-full md:bg-transparent md:leading-none"
              : "size-full"
          }
        >
          {/* Stretched to the box rather than fitted inside it. object-contain
              letterboxes when the two ratios differ, and the screen offsets
              below are measured against the box — so any letterboxing puts
              them off the artwork, which is what threw the picture outside the
              cabinet before. Filling guarantees they agree; the ratio is
              already pinned above, so there is nothing to distort.
              Always mounted and hidden with CSS, because the player replaces
              the host node below with an iframe and inserting or removing a
              sibling beside it breaks reconciliation. */}
          <img
            src="/tv.png"
            alt=""
            aria-hidden
            className={`pointer-events-none absolute inset-0 z-10 size-full ${
              expanded ? "hidden md:block" : "hidden"
            }`}
          />
          {/* The screen opening. Positioning and clipping live here, not on the
              host below: the player replaces that node with an iframe and the
              replacement keeps none of its classes, so anything set there is
              destroyed the moment playback attaches — which is what let the
              picture escape and fill the whole cabinet.
              overflow-hidden is the backstop. Whatever size the iframe ends up,
              it cannot paint outside the opening. */}
          <div className="size-full overflow-hidden md:absolute md:left-[10.03%] md:top-[10.74%] md:h-[73.14%] md:w-[61.85%]">
            <div ref={hostRef} className="size-full" />
          </div>
        </div>
      </div>

      {/* Scrims keep the header and controls legible over the picture. Only
          needed where the video runs edge to edge. */}
      {expanded && (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-background via-background/70 to-transparent md:hidden" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-background via-background/85 to-transparent md:hidden" />
        </>
      )}

      {expanded && (
        <div className="relative z-10 shrink-0 px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-6">
          <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-4">
            {song && (
              <div className="w-full text-center">
                <h2 className="truncate text-2xl">{song.title}</h2>
                <p className="truncate text-sm text-muted-foreground">
                  {song.artists.join(", ") || "Unknown artist"}
                  {song.film ? ` · ${song.film}` : ""}
                </p>
                {/* Shown only where someone gave a name. Most will not, and an
                    empty credit line reads worse than no credit at all. */}
                <button
                  onClick={() => setDetailsOpen(true)}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/[0.07] px-3 py-1 text-xs text-muted-foreground transition hover:bg-white/[0.14] hover:text-foreground"
                >
                  <Info className="size-3.5" />
                  Credits
                </button>
                {credit && (
                  <p className="mt-2 truncate text-xs text-primary/80">
                    {credit.kind === "corrected" ? "Corrected by" : "Found by"}{" "}
                    {credit.name}
                  </p>
                )}
              </div>
            )}
            {transport()}
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
        // Sits inside the content column, so it needs no manual offset —
        // the frame's flex layout already keeps it clear of the rail.
        // No overflow-hidden here. The scrubber's handle sits astride the top
        // edge, so clipping the footer cut its upper half off and left it
        // looking like it hung below the line. Only the ambient wash actually
        // needs clipping, and it now clips itself.
        <footer className="relative z-50 shrink-0 border-t bg-card/80 backdrop-blur lg:rounded-lg lg:border">
      {/* Ambient wash from the current track, so the bar picks up its colour.
          A child rather than a background image on the footer: it has to paint
          over the footer's own surface, and the veil above it is what keeps
          the controls legible against bright artwork. */}
      {ambient && song && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden lg:rounded-lg"
        >
          <img
            key={song.video}
            src={artwork(song.video, "hq")}
            alt=""
            className="size-full object-cover opacity-40 blur-3xl saturate-[1.6] transition-opacity duration-700"
          />
          <div className="absolute inset-0 bg-card/70" />
        </div>
      )}

      {/* Progress across the bar's own top edge, full width and full bleed.
          Above the row rather than inside it, so nothing constrains its span. */}
      <div className="absolute inset-x-0 top-0 z-30">
        <Scrubber
          value={duration > 0 ? elapsed / duration : 0}
          onCommit={seek}
          disabled={!song || duration <= 0}
          className="w-full"
          edge
        />
      </div>

      {/* 1fr on both sides and a fixed centre, so the now-playing block sits in
          the middle of the *bar* rather than the middle of whatever space the
          controls leave over. With a flexible centre column the thumbnail slid
          left and right as titles changed length, which is the jumping. */}
      <div className="relative grid grid-cols-[auto_1fr] items-center gap-3 px-3 py-2.5 md:grid-cols-[1fr_auto_1fr] md:gap-4 md:px-4 md:py-3">
        {/* Transport, at the left edge where the hand goes first. */}
        <div className="flex items-center gap-0.5 md:gap-1">
          <button onClick={onPrev} disabled={!song} className={iconButton} title="Previous">
            <SkipBack className="size-4 fill-current" />
          </button>
          <button
            onClick={toggle}
            disabled={!song || !ready}
            title={playing ? "Pause" : "Play"}
            className="grid size-10 place-items-center rounded-full bg-foreground text-background shadow-[0_2px_10px_-2px_rgba(0,0,0,0.5)] ring-1 ring-primary/20 transition-all duration-200 hover:scale-105 hover:shadow-[0_4px_18px_-2px_rgba(214,168,84,0.45)] hover:ring-primary/40 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:hover:scale-100"
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
          {/* Elapsed and total together, beside the controls rather than under
              the scrubber — the scrubber has no labels now that it is an edge. */}
          {/* Fixed width as well as tabular figures: the digits are even, but
              crossing ten minutes adds one, which would nudge everything. */}
          <span className="ml-1 hidden w-[6.5rem] whitespace-nowrap text-xs tabular-nums text-muted-foreground lg:block">
            {formatTime(elapsed)} / {formatTime(duration)}
          </span>
        </div>

        {/* Now playing. The video host is rendered unconditionally: the player
            is constructed against it on mount, so gating it behind `song`
            would mean the player is never created at all. */}
        {/* The whole now-playing region expands, not just the thumbnail, and
            a swipe up does the same on touch. */}
        <button
          {...barSwipe}
          onClick={() => setExpanded(true)}
          title="Expand to video"
          // A fixed width, so the block occupies the same space whatever is
          // playing. Titles here range from "Aa" to a full line of Devanagari,
          // and letting the box follow them is what moved the thumbnail around
          // between tracks. Full width below md, where it is the only thing on
          // the row.
          className="group/np flex min-w-0 items-center gap-3 text-left md:w-[19rem] lg:w-[24rem]"
        >
          <span className="relative size-10 shrink-0 overflow-hidden rounded shadow-sm ring-1 ring-white/10">
            <img
              src={artwork(song.video)}
              alt=""
              loading="lazy"
              className="size-full object-cover"
            />
            <span className="absolute inset-0 grid place-items-center bg-black/55 text-white opacity-0 transition group-hover/np:opacity-100 group-focus-visible/np:opacity-100">
              <Maximize2 className="size-4" />
            </span>
          </span>

          {/* Overflow dissolves rather than ending in an ellipsis. The mask
              covers the box, so a title short enough to stop before the
              gradient is left alone — only the ones that run on get faded. */}
          <span className="fade-r min-w-0 flex-1 overflow-hidden">
            <span className="block whitespace-nowrap text-sm font-medium">
              {song.title}
            </span>
            <span className="block whitespace-nowrap text-xs text-muted-foreground">
              {failure ? (
                <span className="text-destructive">{failure}</span>
              ) : loading ? (
                "Loading…"
              ) : (
                song.artists.join(", ") || "Unknown artist"
              )}
            </span>
          </span>
        </button>

        {/* Everything that modifies playback rather than driving it. */}
        <div className="hidden items-center justify-end gap-1 md:flex">
          {song && song.confidence < 0.85 && (
            <span
              title="Matched on singer alone — this may not be the catalogue recording"
              className="rounded border border-primary/40 px-1.5 py-0.5 text-[10px] text-primary"
            >
              unverified
            </span>
          )}
          {/* Credits and reporting sit next to the track they are about. The
              bar has room for a title and a line of singers, so the composer
              and lyricist are one press away rather than absent. */}
          <button
            onClick={() => setDetailsOpen(true)}
            className={iconButton}
            title="Credits for this song"
          >
            <Info className="size-4" />
          </button>
          <button
            onClick={() => setReportOpen(true)}
            className={iconButton}
            title="Wrong recording? Tell us"
          >
            <Flag className="size-4" />
          </button>
          <button
            onClick={() => setQueueOpen(true)}
            className={iconButton}
            title="Queue"
          >
            <ListVideo className="size-4" />
          </button>
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
          <button
            onClick={onToggleRepeat}
            title="Repeat one"
            className={`${iconButton} ${repeat ? "text-primary hover:text-primary" : ""}`}
          >
            <Repeat className="size-4" />
          </button>
          <button
            onClick={onToggleShuffle}
            title="Shuffle"
            className={`${iconButton} ${shuffle ? "text-primary hover:text-primary" : ""}`}
          >
            <Shuffle className="size-4" />
          </button>
          <button
            onClick={() => setExpanded(true)}
            title="Expand"
            className={iconButton}
          >
            <ChevronUp className="size-5" />
          </button>
          </div>
        </div>
          {detailsOpen && song && (
            <SongDetails song={song} onClose={() => setDetailsOpen(false)} />
          )}
          {reportOpen && song && (
            <ReportDialog
              kind="wrong-track"
              songId={song.id}
              songTitle={song.title}
              songFilm={song.film ?? undefined}
              currentVideoId={song.video}
              onClose={() => setReportOpen(false)}
            />
          )}
          {catalogue && (
            <QueuePanel
              catalogue={catalogue}
              open={queueOpen}
              onClose={() => setQueueOpen(false)}
            />
          )}
        </footer>
      )}
    </>
  );
}
