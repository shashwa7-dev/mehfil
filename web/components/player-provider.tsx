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
  /** The same list, observable, so the queue view can render it. */
  queue: RawSong[];
  play: (id: number) => void;
  playFirst: (songs: RawSong[]) => void;
  playRandom: (songs: RawSong[]) => void;
  toggleAmbient: () => void;
  /** Ids the player could not start this session, for the list to mark. */
  unplayable: Record<number, string>;
};

const PlayerContext = createContext<PlayerApi | null>(null);

/** The player bar element, so the frame can place it in the content column. */
const PlayerBarContext = createContext<React.ReactNode>(null);

export function usePlayerBar() {
  return useContext(PlayerBarContext);
}

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

  // Mirrored into state as well as a ref. The ref keeps next/previous cheap
  // and free of stale closures; the state is what lets the queue view show
  // what is coming without polling.
  const queueRef = useRef<RawSong[]>([]);
  const [queue, setQueueState] = useState<RawSong[]>([]);
  const setQueue = useCallback((songs: RawSong[]) => {
    queueRef.current = songs;
    setQueueState(songs);
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

  /**
   * Play a song from the start, even if it is the one already loaded.
   *
   * setCurrentId with the value it already holds changes nothing, so the load
   * effect never runs and the player sits where it stopped. Clearing first
   * makes the id genuinely change, which is what re-triggers the load.
   */
  const restart = useCallback((id: number) => {
    setCurrentId(null);
    setPlaying(true);
    window.setTimeout(() => setCurrentId(id), 0);
  }, []);

  const step = useCallback(
    (delta: number) => {
      const queue = queueRef.current;
      if (queue.length === 0) return;
      const target =
        shuffle && delta > 0
          ? queue[Math.floor(Math.random() * queue.length)]
          : queue[
              (queue.findIndex((s) => s.id === currentId) + delta + queue.length) %
                queue.length
            ] ?? queue[0];

      // Landing on the song already playing is not a no-op, it is a restart.
      // A queue of one wraps to itself, and shuffle can pick the same track;
      // both used to leave the player stopped while the bar showed it playing.
      if (target.id === currentId) {
        restart(target.id);
        return;
      }
      play(target.id);
    },
    [currentId, play, restart, shuffle]
  );

  const onEnded = useCallback(() => {
    if (repeat && currentId !== null) {
      restart(currentId);
      return;
    }
    step(1);
  }, [repeat, currentId, restart, step]);

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
      queue,
      play,
      playFirst,
      playRandom,
      toggleAmbient: () => setAmbient((v) => !v),
      unplayable,
    }),
    [currentId, playing, ambient, setQueue, queue, play, playFirst, playRandom, unplayable]
  );

  // Rendered by the frame rather than here, so the bar can sit inside the
  // content column while this component stays pure state.
  const bar = (
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
  );

  return (
    <PlayerContext.Provider value={api}>
      <PlayerBarContext.Provider value={bar}>{children}</PlayerBarContext.Provider>
    </PlayerContext.Provider>
  );
}
