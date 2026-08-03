"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { PlayerBar } from "@/components/player-bar";
import { hydrate, type Catalogue, type RawSong } from "@/lib/catalogue";
import { useCatalogue } from "@/lib/queries";

type PlayerApi = {
  currentId: number | null;
  playing: boolean;
  ambient: boolean;
  /** Songs the player advances through. Set by whichever route is showing. */
  setQueue: (songs: RawSong[]) => void;
  play: (id: number) => void;
  playFirst: (songs: RawSong[]) => void;
  playRandom: (songs: RawSong[]) => void;
  toggleAmbient: () => void;
  /** Ids the player could not start this session, for the list to mark. */
  unplayable: Record<number, string>;
};

const PlayerContext = createContext<PlayerApi | null>(null);

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) throw new Error("usePlayer must be used inside PlayerProvider");
  return context;
}

/**
 * Owns playback for the whole app.
 *
 * Rendered in the root layout rather than in a page, because a layout persists
 * across navigation while a page remounts. Anywhere else, moving between
 * routes would tear down the YouTube iframe and stop the music mid-song —
 * which is the constraint that shapes this entire structure.
 */
export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const { data: catalogue } = useCatalogue();

  const [currentId, setCurrentId] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [ambient, setAmbient] = useState(true);
  const [unplayable, setUnplayable] = useState<Record<number, string>>({});

  // A ref, not state: the queue changes on every route and filter change, and
  // re-rendering the player for it would be pointless churn.
  const queueRef = useRef<RawSong[]>([]);
  const setQueue = useCallback((songs: RawSong[]) => {
    queueRef.current = songs;
  }, []);

  const play = useCallback((id: number) => {
    setCurrentId(id);
    setPlaying(true);
  }, []);

  const playFirst = useCallback(
    (songs: RawSong[]) => {
      if (songs.length === 0) return;
      setQueue(songs);
      play(shuffle ? songs[Math.floor(Math.random() * songs.length)].id : songs[0].id);
    },
    [play, setQueue, shuffle]
  );

  const playRandom = useCallback(
    (songs: RawSong[]) => {
      if (songs.length === 0) return;
      setQueue(songs);
      play(songs[Math.floor(Math.random() * songs.length)].id);
    },
    [play, setQueue]
  );

  const step = useCallback(
    (delta: number) => {
      const queue = queueRef.current;
      if (queue.length === 0) return;
      if (shuffle && delta > 0) {
        play(queue[Math.floor(Math.random() * queue.length)].id);
        return;
      }
      const at = queue.findIndex((s) => s.id === currentId);
      const next = queue[(at + delta + queue.length) % queue.length] ?? queue[0];
      play(next.id);
    },
    [currentId, play, shuffle]
  );

  const onEnded = useCallback(() => {
    if (repeat && currentId !== null) {
      // Clearing then restoring re-triggers the load effect for the same id.
      const id = currentId;
      setCurrentId(null);
      window.setTimeout(() => setCurrentId(id), 0);
      return;
    }
    step(1);
  }, [repeat, currentId, step]);

  const handleUnplayable = useCallback(
    (songId: number, reason: string) => {
      setUnplayable((prev) => (prev[songId] ? prev : { ...prev, [songId]: reason }));
      // A late failure from a track the user already left must not hijack
      // whatever is playing now.
      if (songId !== currentId) return;
      const queue = queueRef.current;
      const at = queue.findIndex((s) => s.id === songId);
      for (let i = 1; i <= queue.length; i++) {
        const candidate = queue[(at + i) % queue.length];
        if (!candidate || candidate.id === songId) break;
        if (!unplayable[candidate.id]) {
          play(candidate.id);
          return;
        }
      }
    },
    [currentId, play, unplayable]
  );

  const currentSong = useMemo(() => {
    if (!catalogue || currentId === null) return null;
    const raw = catalogue.songs.find((s) => s.id === currentId);
    return raw ? hydrate(raw, catalogue.facets as Catalogue["facets"]) : null;
  }, [catalogue, currentId]);

  const api = useMemo<PlayerApi>(
    () => ({
      currentId,
      playing,
      ambient,
      setQueue,
      play,
      playFirst,
      playRandom,
      toggleAmbient: () => setAmbient((v) => !v),
      unplayable,
    }),
    [currentId, playing, ambient, setQueue, play, playFirst, playRandom, unplayable]
  );

  return (
    <PlayerContext.Provider value={api}>
      {/* Owns the vertical frame: the route fills the space above, the bar
          takes what it needs below. Without this the route claimed the whole
          viewport and pushed the bar off-screen. */}
      <div className="flex h-[100dvh] flex-col">
        <div className="min-h-0 flex-1">{children}</div>

        <PlayerBar
        song={currentSong}
        shuffle={shuffle}
        repeat={repeat}
        ambient={ambient}
        onToggleShuffle={() => setShuffle((v) => !v)}
        onToggleRepeat={() => setRepeat((v) => !v)}
        onToggleAmbient={() => setAmbient((v) => !v)}
        onNext={() => step(1)}
        onPrev={() => step(-1)}
        onEnded={onEnded}
        onPlayingChange={setPlaying}
          onUnplayable={handleUnplayable}
        />
      </div>
    </PlayerContext.Provider>
  );
}
