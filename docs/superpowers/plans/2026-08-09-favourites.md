# Favourites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let someone mark songs they like, keep those marks on their device, and give them a route to play them back.

**Architecture:** One module owns the stored ids and exposes them through `useSyncExternalStore`, so localStorage is treated as the external state it is and each row subscribes individually. A separate module owns the tap animation and renders it through a portal on `document.body`, because the song list both clips and unmounts its rows. A heart button composes the two. The route reuses the existing `SongList` and `setQueue` pattern, so no playback code is added.

**Tech Stack:** Next.js 16 App Router, React 19 (`useSyncExternalStore`, `createPortal`), Tailwind v4, lucide-react, react-virtuoso.

## Global Constraints

- **Storage key:** `mehfil:favourites:v1` — version in the key, so a format change is a new key rather than a migration.
- **Stored value:** a JSON array of song ids in the order they were liked. No bitset, no packing: the full catalogue is 19.9 KB, 0.38% of the smallest quota.
- **Never throw from storage.** `setItem` fails in private mode and on a full disk; the in-memory state stays correct and the session keeps working.
- **Never prune unknown ids.** Ids whose songs are missing from the catalogue stay in storage and are filtered at render — pruning on read would delete someone's likes on any load where the catalogue fetch failed.
- **Burst on liking only, never on unliking.**
- **`prefers-reduced-motion: reduce` suppresses particles entirely**, keeping the fill. The state change is the information; the particles are decoration.
- **No test framework exists.** `web/package.json` defines `lint` and `build` only. Verification is `npx tsc --noEmit`, `npm run lint`, `npm run build`, and the named manual checks in each task. Do not add a test framework as part of this work.
- **Spelling is British throughout** (`favourites`), matching the existing copy.
- Every file starts with `"use client"` if it uses hooks, state, or browser APIs.

## File structure

| File | Responsibility |
|---|---|
| `web/lib/favourites.ts` (create) | The stored ids. Nothing else — it knows about numbers, not songs. |
| `web/components/like-burst.tsx` (create) | The particle animation and its portal host. Knows nothing about favourites. |
| `web/components/like-button.tsx` (create) | The heart. Composes the two modules above. |
| `web/app/globals.css` (modify) | The one keyframe rule the particles animate on. |
| `web/components/track-row.tsx` (modify) | A heart in the existing right-hand column. |
| `web/components/player-bar.tsx` (modify) | A heart in the collapsed bar and in the expanded actions row. |
| `web/app/favourites/page.tsx` (create) | The route. |
| `web/components/app-frame.tsx` (modify) | Nav item, and mounts the burst host once. |

The two created modules do not import each other. `like-button.tsx` is the only file that knows both exist, which is what keeps the animation reusable and the storage testable by inspection.

---

### Task 1: The storage module

**Files:**
- Create: `web/lib/favourites.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `useIsFavourite(id: number): boolean`
  - `useFavouriteIds(): readonly number[]`
  - `useFavouritesRevision(): number`
  - `toggleFavourite(id: number): void`
  - `isFavourite(id: number): boolean` — non-hook read, for the button deciding whether to burst

- [ ] **Step 1: Write the module**

```tsx
"use client";

import { useSyncExternalStore } from "react";

/**
 * Which songs someone has liked, kept on their device.
 *
 * localStorage rather than a database, because an account is the wrong price
 * for this. Storing likes server-side needs a login, and a login is a wall in
 * front of an app that currently asks nothing of anyone — a large amount of
 * machinery, plus a privacy policy, to hold about twenty kilobytes.
 *
 * Twenty kilobytes is measured, not estimated: all 3,916 ids as a JSON array is
 * 19.9 KB, 0.38% of the smallest quota. So there is no encoding scheme here. A
 * bitset would cost readability and buy nothing.
 *
 * Read through useSyncExternalStore rather than a context, because localStorage
 * genuinely is external state: the hook's server-snapshot path handles the
 * server render without a `mounted` flag, and rows subscribe individually so
 * liking one song re-renders that row instead of the whole list.
 *
 * The trade accepted: favourites are per-browser, they do not follow anyone to
 * another device, and clearing site data destroys them. That is deliberate.
 */

const KEY = "mehfil:favourites:v1";

/** Frozen so the server snapshot is referentially stable across renders. */
const EMPTY: readonly number[] = Object.freeze([]);

const listeners = new Set<() => void>();

// Cached rather than re-read per render: getSnapshot runs on every render of
// every subscriber, and parsing 20 KB of JSON there would be pointless work.
// Both caches are dropped together whenever the underlying value changes.
let ids: readonly number[] | null = null;
let index: ReadonlySet<number> | null = null;
let revision = 0;

function read(): number[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    // Anything could be under this key — another tab's bug, a hand-edited
    // value, a half-written string. Take only what is usable rather than
    // letting a bad entry throw on every render.
    return Array.isArray(parsed)
      ? parsed.filter((value): value is number => Number.isInteger(value))
      : [];
  } catch {
    // Private mode can refuse getItem outright, and JSON.parse throws on a
    // truncated value. Neither is a reason to fail the render.
    return [];
  }
}

function current(): readonly number[] {
  if (ids === null) ids = Object.freeze(read());
  return ids;
}

/** O(1) membership, so a list of rows does not scan the array per row. */
function currentIndex(): ReadonlySet<number> {
  if (index === null) index = new Set(current());
  return index;
}

function commit(next: number[]) {
  ids = Object.freeze(next);
  index = new Set(next);
  revision += 1;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Quota exceeded, or private mode refusing writes. The in-memory state is
    // still correct, so the session behaves normally and only persistence is
    // lost. Failing the toggle instead would make the app look broken.
  }
  for (const listener of listeners) listener();
}

/**
 * Another tab wrote the key.
 *
 * Without this, two tabs silently eat each other's likes: tab A writes its
 * array, tab B — holding a copy from before that write — writes its own, and
 * A's like is gone. This is a data-loss fix, not a nicety.
 *
 * A null key means storage.clear(), which also concerns us.
 */
function onStorage(event: StorageEvent) {
  if (event.key !== null && event.key !== KEY) return;
  ids = null;
  index = null;
  revision += 1;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

/** Whether a song is liked, without subscribing. For event handlers. */
export function isFavourite(id: number): boolean {
  return currentIndex().has(id);
}

export function toggleFavourite(id: number) {
  const now = current();
  commit(isFavourite(id) ? now.filter((value) => value !== id) : [...now, id]);
}

export function useIsFavourite(id: number): boolean {
  // A boolean snapshot, so only rows whose own state changed re-render.
  return useSyncExternalStore(
    subscribe,
    () => currentIndex().has(id),
    () => false
  );
}

export function useFavouriteIds(): readonly number[] {
  return useSyncExternalStore(subscribe, current, () => EMPTY);
}

/**
 * A counter that moves on every change.
 *
 * The favourites route feeds a filter key to the paged list, and that key has
 * to change whenever the set does. Length cannot do it — unliking one song and
 * liking another leaves it identical — and joining 3,500 ids into a string on
 * every render to use as a cache key is worse than counting.
 */
export function useFavouritesRevision(): number {
  return useSyncExternalStore(
    subscribe,
    () => revision,
    () => 0
  );
}
```

- [ ] **Step 2: Verify it compiles and the app still builds**

```bash
cd web && npx tsc --noEmit && npm run lint && npm run build
```

Expected: tsc silent, lint `0 errors`, build `✓ Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add web/lib/favourites.ts
git commit -m "Keep liked songs on the device"
```

---

### Task 2: The burst

**Files:**
- Create: `web/components/like-burst.tsx`
- Modify: `web/app/globals.css` (append the keyframes at the end of the file)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `burstAt(x: number, y: number): void` — screen coordinates of the burst origin
  - `<LikeBurstHost />` — mounted exactly once, renders nothing until a burst fires

- [ ] **Step 1: Add the keyframes to `web/app/globals.css`**

Append at the end of the file:

```css
/* A liked heart throwing off smaller ones.
 *
 * One static rule for every particle: each is handed its own drift, rise,
 * rotation, end scale and delay as custom properties, so six differ without six
 * keyframe definitions.
 *
 * Transform and opacity only. Both are composited, so the whole burst runs off
 * the main thread and cannot cause layout while a song is starting. */
@keyframes like-rise {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.4) rotate(0deg);
  }
  15% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy)))
      scale(var(--end-scale)) rotate(var(--rot));
  }
}
```

- [ ] **Step 2: Write `web/components/like-burst.tsx`**

```tsx
"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Heart } from "lucide-react";

/**
 * Small hearts rising from a tap.
 *
 * Portalled onto document.body rather than rendered where the tap happened,
 * for two independent reasons that have the same fix. The song list is a scroll
 * container, so particles rising out of a row would be clipped at its edge; and
 * the list is virtualised, so the row can unmount mid-flight and take the
 * animation with it. Positioned from the button's screen coordinates, captured
 * at click time, they are subject to neither.
 *
 * The host is mounted once by the app frame and renders nothing until a burst
 * fires. A module-level emitter reaches it, so a button does not need to be
 * wired to anything.
 */

type Particle = {
  dx: string;
  dy: string;
  rot: string;
  scale: string;
  delay: string;
  size: number;
};

type Burst = { key: number; x: number; y: number; particles: Particle[] };

const COUNT = 6;
/** Longest a particle can still be on screen: duration + the largest delay. */
const LIFETIME = 1100;
/**
 * Four at once is plenty. A fifth drops the oldest rather than queueing —
 * queued bursts arrive after the tap that caused them and read as lag.
 */
const MAX = 4;

let sequence = 0;
let bursts: readonly Burst[] = Object.freeze([]);
const listeners = new Set<() => void>();

function publish(next: Burst[]) {
  bursts = Object.freeze(next);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function particle(): Particle {
  // Signed drift so they fan out either side, biased upward by the rise.
  const dx = Math.round((Math.random() - 0.5) * 90);
  const dy = -Math.round(70 + Math.random() * 70);
  return {
    dx: `${dx}px`,
    dy: `${dy}px`,
    rot: `${Math.round((Math.random() - 0.5) * 90)}deg`,
    scale: (0.4 + Math.random() * 0.4).toFixed(2),
    delay: `${Math.round(Math.random() * 120)}ms`,
    size: 10 + Math.round(Math.random() * 8),
  };
}

/**
 * Fire a burst at a point on screen.
 *
 * Silently does nothing under reduced motion. That is not a lesser version of
 * the feature: the heart filling is the information, and this is decoration.
 */
export function burstAt(x: number, y: number) {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const key = ++sequence;
  const next = [
    ...bursts,
    { key, x, y, particles: Array.from({ length: COUNT }, particle) },
  ].slice(-MAX);
  publish(next);

  // A timer rather than animationend. The end event would arrive six times per
  // burst and the last one is not identifiable without tracking them, whereas
  // the duration is a number we chose. It also survives a tab backgrounded
  // mid-animation, where animation events never arrive at all.
  window.setTimeout(() => {
    publish(bursts.filter((burst) => burst.key !== key));
  }, LIFETIME);
}

export function LikeBurstHost() {
  const active = useSyncExternalStore(
    subscribe,
    () => bursts,
    () => Object.freeze([]) as readonly Burst[]
  );

  // Portals need a DOM target, which does not exist during the server render.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || active.length === 0) return null;

  return createPortal(
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[95]">
      {active.map((burst) =>
        burst.particles.map((p, i) => (
          <Heart
            key={`${burst.key}-${i}`}
            className="absolute fill-primary text-primary"
            style={
              {
                left: burst.x,
                top: burst.y,
                width: p.size,
                height: p.size,
                "--dx": p.dx,
                "--dy": p.dy,
                "--rot": p.rot,
                "--end-scale": p.scale,
                animation: `like-rise 900ms cubic-bezier(0.22, 0.61, 0.36, 1) ${p.delay} both`,
              } as React.CSSProperties
            }
          />
        ))
      )}
    </div>,
    document.body
  );
}
```

- [ ] **Step 3: Verify**

```bash
cd web && npx tsc --noEmit && npm run lint && npm run build
```

Expected: tsc silent, lint `0 errors`, build `✓ Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
git add web/components/like-burst.tsx web/app/globals.css
git commit -m "Add the burst a liked heart throws off"
```

---

### Task 3: The heart button

**Files:**
- Create: `web/components/like-button.tsx`

**Interfaces:**
- Consumes: `useIsFavourite`, `isFavourite`, `toggleFavourite` from Task 1; `burstAt` from Task 2.
- Produces: `<LikeButton songId={number} className?={string} size?={number} />`

- [ ] **Step 1: Write the component**

```tsx
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
```

- [ ] **Step 2: Verify**

```bash
cd web && npx tsc --noEmit && npm run lint && npm run build
```

Expected: tsc silent, lint `0 errors`, build `✓ Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add web/components/like-button.tsx
git commit -m "Add the heart control"
```

---

### Task 4: Put the heart where songs are

**Files:**
- Modify: `web/components/track-row.tsx` — right-hand action column
- Modify: `web/components/player-bar.tsx` — collapsed bar, and the expanded secondary actions row
- Modify: `web/components/app-frame.tsx` — mount `<LikeBurstHost />` once

**Interfaces:**
- Consumes: `<LikeButton>` from Task 3, `<LikeBurstHost>` from Task 2.
- Produces: nothing new.

- [ ] **Step 1: Add the import and the button to `web/components/track-row.tsx`**

Add to the imports:

```tsx
import { LikeButton } from "@/components/like-button";
```

In the final `<div className="flex items-center gap-3 pr-1">`, insert the button as the **last** child, after the confidence dot:

```tsx
        <LikeButton songId={song.id} size={15} className="size-7" />
```

- [ ] **Step 2: Add the burst host in `web/components/app-frame.tsx`**

Add to the imports:

```tsx
import { LikeBurstHost } from "@/components/like-burst";
```

Render it once, as the last child of the component's outermost returned element, beside the existing frame content:

```tsx
      <LikeBurstHost />
```

- [ ] **Step 3: Add the heart to the collapsed player bar in `web/components/player-bar.tsx`**

Add to the imports:

```tsx
import { LikeButton } from "@/components/like-button";
```

In the collapsed bar, immediately after the element whose `onClick` is `() => setDetailsOpen(true)` around line 978 — the song title and artist cluster — add as its next sibling:

```tsx
          {song && <LikeButton songId={song.id} size={16} className="size-8" />}
```

- [ ] **Step 4: Add the heart to the expanded secondary actions row in `web/components/player-bar.tsx`**

In the expanded view's secondary actions row — the one using the `secondaryAction` class alongside details and report — add as the first action:

```tsx
              {song && (
                <LikeButton
                  songId={song.id}
                  size={16}
                  className={secondaryAction}
                />
              )}
```

- [ ] **Step 5: Verify**

```bash
cd web && npx tsc --noEmit && npm run lint && npm run build
```

Expected: tsc silent, lint `0 errors`, build `✓ Compiled successfully`.

- [ ] **Step 6: Verify by hand — these are the checks a build cannot make**

Run `npm run dev` and confirm each:

1. Clicking a heart in a song row **fills it and does not start the song**.
2. The burst is **not clipped** by the list — particles rise past the top of the row and over the header.
3. Like a song, then immediately scroll it out of view: **the particles still finish**.
4. Reload the page: **the fill survives**.
5. Open a second tab, like a song there, return to the first: **the first tab shows it liked**.
6. In DevTools, set emulation to `prefers-reduced-motion: reduce`, then like a song: **the heart fills, no particles appear**.
7. Unlike a song: **the fill clears and no particles appear**.

- [ ] **Step 7: Commit**

```bash
git add web/components/track-row.tsx web/components/player-bar.tsx web/components/app-frame.tsx
git commit -m "Put the heart in the rows and the player"
```

---

### Task 5: The favourites route

**Files:**
- Create: `web/app/favourites/page.tsx`
- Modify: `web/components/app-frame.tsx` — nav item in the shared nav block

**Interfaces:**
- Consumes: `useFavouriteIds`, `useFavouritesRevision` from Task 1.
- Produces: the `/favourites` route.

- [ ] **Step 1: Write `web/app/favourites/page.tsx`**

```tsx
"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { Heart, Play, Shuffle } from "lucide-react";
import { CatalogueGate } from "@/components/catalogue-gate";
import { useFrame } from "@/components/app-frame";
import { usePlayer } from "@/components/player-provider";
import { SongList } from "@/components/song-list";
import { useFavouriteIds, useFavouritesRevision } from "@/lib/favourites";
import { useCatalogue } from "@/lib/queries";

export default function FavouritesPage() {
  const { data: catalogue, isLoading, isError, error } = useCatalogue();
  const { scrollEl } = useFrame();
  const { currentId, playing, play, playFirst, playRandom, setQueue } = usePlayer();
  const ids = useFavouriteIds();
  const revision = useFavouritesRevision();

  const results = useMemo(() => {
    if (!catalogue) return [];
    const byId = new Map(catalogue.songs.map((song) => [song.id, song]));
    // Newest first, and ids missing from the catalogue are skipped rather than
    // removed from storage: a failed catalogue fetch would otherwise look
    // exactly like every song having been deleted.
    return ids
      .map((id) => byId.get(id))
      .filter((song): song is NonNullable<typeof song> => Boolean(song))
      .reverse();
  }, [catalogue, ids]);

  // The player advances through whatever this route is showing.
  useEffect(() => setQueue(results), [results, setQueue]);

  return (
    <CatalogueGate isLoading={isLoading} isError={isError} error={error}>
      {catalogue && (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3 pb-4">
            <div className="min-w-0">
              <h2 className="truncate pt-1 text-2xl leading-tight">Your favourites</h2>
              <p className="text-xs text-muted-foreground">
                {results.length.toLocaleString()}{" "}
                {results.length === 1 ? "song" : "songs"} · kept on this device
              </p>
            </div>
            {results.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => playRandom(results)}
                  title="Shuffle"
                  className="grid size-10 place-items-center rounded-full border border-white/15 transition hover:bg-white/10"
                >
                  <Shuffle className="size-4" />
                </button>
                <button
                  onClick={() => playFirst(results)}
                  title="Play"
                  className="grid size-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:scale-105"
                >
                  <Play className="size-5 translate-x-px fill-current" />
                </button>
              </div>
            )}
          </div>

          {results.length === 0 ? (
            <div className="py-20 text-center">
              <Heart className="mx-auto size-8 text-muted-foreground/40" />
              <p className="mt-4 text-sm text-muted-foreground">
                Nothing here yet. Tap the heart beside any song and it will be
                waiting for you.
              </p>
              <Link
                href="/songs"
                className="mt-4 inline-block rounded-full border border-white/15 px-4 py-2 text-xs transition hover:bg-white/10"
              >
                Browse all songs
              </Link>
            </div>
          ) : (
            <SongList
              catalogue={catalogue}
              songs={results}
              filterKey={`favourites:${revision}`}
              currentId={currentId}
              playing={playing}
              scrollParent={scrollEl}
              onPlay={play}
            />
          )}
        </>
      )}
    </CatalogueGate>
  );
}
```

- [ ] **Step 2: Add the nav item in `web/components/app-frame.tsx`**

Add `Heart` to the existing `lucide-react` import. In the shared nav block — the one whose comment says it serves both the rail and the mobile menu — insert between the "All songs" and "Help us find songs" links:

```tsx
        <Link href="/favourites" className={navClass(pathname === "/favourites")}>
          <Heart className="size-4" /> Your favourites
        </Link>
```

- [ ] **Step 3: Verify**

```bash
cd web && npx tsc --noEmit && npm run lint && npm run build
```

Expected: tsc silent, lint `0 errors`, build `✓ Compiled successfully`.

- [ ] **Step 4: Verify the route responds**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/favourites
```

Expected: `200`.

- [ ] **Step 5: Verify by hand**

1. With nothing liked, `/favourites` shows the empty state and **no play buttons**.
2. Like three songs, return: **all three appear, most recent first**.
3. Press Play: it plays, and **Next advances within the favourites**, not the whole catalogue.
4. Unlike a song while standing on the route: **it disappears from the list immediately**.
5. Unlike every song while playing: the list empties and **playback continues** rather than crashing.
6. The nav item is present in both the desktop rail and the mobile drawer, and **highlights when on the route**.

- [ ] **Step 6: Commit**

```bash
git add web/app/favourites/page.tsx web/components/app-frame.tsx
git commit -m "Add the favourites route"
```

---

## Self-review

**Spec coverage.** Storage module with the three named exports — Task 1, plus `isFavourite` and `useFavouritesRevision`, both needed by later tasks and both documented above. `setItem` throwing — Task 1, `commit`. Cross-tab `storage` listener — Task 1, `onStorage`. Heart in the track row, collapsed bar, and expanded actions — Task 4. Portalled burst, six particles, custom properties, one keyframe rule, transform and opacity only — Task 2. Like-only, reduced-motion, capped at four dropping the oldest — Task 2. `aria-hidden` and `pointer-events-none` on particles, `aria-pressed` on the button — Tasks 2 and 3. Route reusing `SongList` and `setQueue`, nav item, empty state, unknown ids filtered not pruned — Task 5.

**One deliberate deviation from the spec.** The spec said cleanup would run on the last `animationend` with a timeout as backstop. The plan uses the timer alone: six particles each fire the event, the last is not identifiable without tracking them, and the duration is a number we choose rather than one we must observe. The backstop was the reliable half of that pair; the event added a code path that could only agree with it.

**Placeholders.** None — every step carries the code it needs.

**Type consistency.** `useIsFavourite`, `useFavouriteIds`, `useFavouritesRevision`, `isFavourite`, `toggleFavourite`, `burstAt`, `LikeBurstHost`, `LikeButton` are used in later tasks exactly as declared in their producing task. `SongList` is called with the same props as `web/app/songs/page.tsx` passes today.

**Not covered, and correctly so:** backup and export, sync, like counts, playlists, and any separate recently-liked ordering — storing ids in like-order and reversing at render provides the last one already.
