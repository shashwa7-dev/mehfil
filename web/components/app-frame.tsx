"use client";

import { createContext, useContext, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Disc3,
  HeartHandshake,
  LayoutGrid,
  ListMusic,
  Menu,
  Search,
  X,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { InstallButton } from "@/components/install-prompt";
import { LikeBurstHost } from "@/components/like-burst";
import { facetCards, portrait } from "@/lib/catalogue";
import { usePlayer, usePlayerBar } from "@/components/player-provider";
import { useCatalogue, usePhotoManifest } from "@/lib/queries";

type Frame = {
  /** Scroll container the virtualised lists measure against. */
  scrollEl: HTMLElement | null;
  /** Portal target for the current route's filter panel. */
  filterSlot: HTMLElement | null;
  query: string;
  setQuery: (value: string) => void;
};

const FrameContext = createContext<Frame | null>(null);

export function useFrame() {
  const context = useContext(FrameContext);
  if (!context) throw new Error("useFrame must be used inside AppFrame");
  return context;
}

/**
 * The application chrome, rendered once in the root layout.
 *
 * Living in the layout rather than in each page means the rail keeps its full
 * height beside the player and does not remount on navigation. Routes are only
 * responsible for their content.
 *
 * The filter panel is route-specific, so the rail exposes a slot that pages
 * portal into. A portal rather than shared state: passing React nodes upward
 * through context invites render loops, and this needs neither.
 */
export function AppFrame({ children }: { children: React.ReactNode }) {
  const { data: catalogue } = useCatalogue();
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);
  const [filterSlot, setFilterSlot] = useState<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  const pathname = usePathname();
  const router = useRouter();
  const playerBar = usePlayerBar();
  const { playRandom } = usePlayer();
  const { data: photos } = usePhotoManifest();

  // The three voices this catalogue is really made of. Named rather than
  // ranked: ranking by catalogue share puts Asha Bhosle third and leaves
  // Kishore Kumar out, and these three together say what the collection is at
  // a glance. Anyone missing a portrait is dropped rather than drawn blank,
  // and if none resolve the control simply shows no faces.
  const faces = useMemo(
    () =>
      ["Lata Mangeshkar", "Kishore Kumar", "Mohammed Rafi"]
        .map((name) => ({ name, src: portrait(name, photos ?? null) }))
        .filter((face): face is { name: string; src: string } => Boolean(face.src)),
    [photos]
  );

  const onBrowse = pathname === "/";
  // The about page has nothing to search and its own back control, so the
  // header would be an empty bar. Mobile still needs the menu, which only
  // lives there, so the row stays below lg with the search removed.
  const hideSearch = pathname === "/about" || pathname === "/contribute";

  const navClass = (active: boolean) =>
    `flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition ${
      active ? "bg-white/[0.09] text-foreground" : "text-muted-foreground hover:text-foreground"
    }`;

  const brandAndNav = (
    <>
      <div className="shrink-0 px-4 pb-3 pt-4">
        <Link href="/" className="flex items-center gap-2.5">
          <img src="/logo.png" alt="" width={36} height={36} className="size-9 rounded-lg" />
          <span>
            <span className="block text-lg leading-tight tracking-tight">Mehfil</span>
            {catalogue && (
              <span className="block text-xs text-muted-foreground">
                {catalogue.songs.length.toLocaleString()} songs ·{" "}
                {catalogue.facets.stations.length} stations
              </span>
            )}
          </span>
        </Link>
      </div>

      <div className="shrink-0 space-y-0.5 px-2 pb-2">
        <Link href="/" className={navClass(onBrowse)}>
          <LayoutGrid className="size-4" /> Browse
        </Link>
        <Link href="/songs" className={navClass(pathname === "/songs")}>
          <ListMusic className="size-4" /> All songs
        </Link>
        <Link href="/contribute" className={navClass(pathname === "/contribute")}>
          <HeartHandshake className="size-4" /> Help us find songs
        </Link>
        <InstallButton />
      </div>
    </>
  );

  // One definition for both the rail and the mobile menu: they are the same
  // surface at different sizes, and two copies would drift.
  const railTexture = (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 top-1/3 [mask-image:linear-gradient(to_top,#000_0%,#000_35%,transparent_100%)]"
    >
      <img
        src="/collage.jpg"
        alt=""
        className="size-full object-cover opacity-[0.20] saturate-[0.55] sepia-[0.35]"
      />
    </div>
  );

  const credit = (
    // Opaque backing: the collage is anchored to the bottom of the rail, so it
    // sits directly behind this text. Without it the smallest type in the app
    // is the one competing with a busy image.
    <div className="shrink-0 space-y-1.5 border-t border-white/[0.06] bg-sidebar/95 px-4 py-3 backdrop-blur-sm">
      <p className="text-[11px] leading-snug text-muted-foreground/70">
        Music streams from YouTube.
        <br />
        Nothing is hosted here.
      </p>
      {/* Stacked, not a row. The rail is 18rem wide and these two links do not
          fit on one line at 11px, so side by side they wrapped mid-phrase. */}
      <div className="flex flex-col gap-1 text-[11px]">
        <Link
          href="/about"
          className="text-muted-foreground transition hover:text-foreground"
        >
          About &amp; credits
        </Link>
        <a
          href="https://shashwa7.in"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground transition hover:text-foreground"
        >
          Made with <span className="text-primary">♥</span> by shashwa7.in
        </a>
      </div>
    </div>
  );

  return (
    <FrameContext.Provider value={{ scrollEl, filterSlot, query, setQuery }}>
      <div className="flex h-[100dvh] gap-0 p-0 lg:gap-2 lg:p-2">
        {/* Full height, beside the player rather than above it. */}
        <aside className="relative hidden w-72 shrink-0 flex-col overflow-hidden rounded-lg bg-sidebar lg:flex">
          {/* Texture for the space the filter panel leaves empty: masked out
              well before the navigation and pulled toward the brass palette,
              so it reads as a surface rather than a picture competing with the
              controls in front of it. */}
          {railTexture}

          {/* Above the texture, or the controls sit behind it. */}
          <div className="relative z-10 flex min-h-0 flex-1 flex-col">
            {brandAndNav}
            <div ref={setFilterSlot} className="min-h-0 flex-1 overflow-hidden" />
            {credit}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-0 lg:gap-2">
          <main
            ref={setScrollEl}
            className="scroll-slim min-h-0 flex-1 overflow-y-auto rounded-none bg-card/40 lg:rounded-lg"
          >
            {/* Gutter must match the content below exactly, or the search box
                sits on a different edge from everything it sits above. */}
            <div
              className={`sticky top-0 z-20 items-center gap-2 bg-background/70 px-4 pb-2 pt-3 backdrop-blur sm:px-6 lg:px-8 ${
                hideSearch ? "flex lg:hidden" : "flex"
              }`}
            >
              <Link href="/" className="flex shrink-0 items-center gap-2 lg:hidden">
                <img src="/logo.png" alt="" width={32} height={32} className="size-8 rounded-lg" />
              </Link>

              {!hideSearch && (
              <div className="relative min-w-0 flex-1 md:max-w-lg">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground transition-colors" />
                <input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    // Searching from anywhere lands on the list that can show
                    // results, rather than silently doing nothing.
                    if (pathname !== "/songs" && e.target.value) router.push("/songs");
                  }}
                  placeholder="Search songs, films, singers…"
                  className="h-10 w-full rounded-full border border-white/10 bg-white/[0.07] pl-10 pr-9 text-sm outline-none transition placeholder:text-muted-foreground/70 hover:border-white/20 hover:bg-white/[0.09] focus:border-primary/50 focus:bg-white/[0.1] focus:ring-4 focus:ring-primary/10"
                />
                {query && (
                  <button
                    onClick={() => setQuery("")}
                    className="absolute right-3 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
              )}

              {/* Fills the empty right side with the one action that needs no
                  prior choice: drop into the catalogue at random. */}
              {catalogue && !hideSearch && (
                <button
                  onClick={() => playRandom(catalogue.songs)}
                  title="Play something at random"
                  className="group/surprise ml-auto hidden shrink-0 items-center gap-2 rounded-full border border-primary/30 bg-primary/15 px-4 py-2 text-xs font-semibold text-primary shadow-[0_0_0_0_rgba(214,168,84,0)] transition-[background-color,border-color,box-shadow] duration-300 hover:border-primary/50 hover:bg-primary/25 hover:shadow-[0_0_20px_-2px_rgba(214,168,84,0.45)] lg:inline-flex"
                >
                  {/* A record, not a shuffle glyph: this plays music at
                      random rather than reordering a list. A full revolution
                      ends where it began — the old half turn stopped upside
                      down and read as a glitch. */}
                  <Disc3 className="size-4 shrink-0 transition-transform duration-[900ms] ease-out motion-safe:group-hover/surprise:rotate-[360deg]" />
                  Surprise

                  {/* The faces fan out on hover. Transform only, never margin:
                      margins are laid out, so animating one reflows the button
                      every frame — which is both why this was not smooth and
                      why the control grew as it played. A transform is composited
                      and moves nothing around it. */}
                  {faces.length > 0 && (
                    <span className="flex shrink-0 -space-x-2">
                      {faces.map((face, index) => (
                        <img
                          key={face.name}
                          src={face.src}
                          alt=""
                          title={face.name}
                          loading="lazy"
                          style={
                            {
                              "--fan": `${index * 5}px`,
                              transitionDelay: `${index * 45}ms`,
                            } as React.CSSProperties
                          }
                          className="size-5 rounded-full object-cover object-top ring-2 ring-card transition-transform duration-300 ease-out motion-safe:group-hover/surprise:translate-x-[var(--fan)]"
                        />
                      ))}
                    </span>
                  )}
                </button>
              )}

              {/* Keyed on the route, and otherwise uncontrolled. Navigating
                  changes the key, React discards this Sheet and mounts a fresh
                  one, and a fresh one is closed — so following a link closes
                  the drawer without anything here having to drive its open
                  state. Driving it was the previous attempt and it stopped the
                  trigger opening at all. */}
              <Sheet key={pathname}>
                <SheetTrigger
                  render={
                    <button
                      title="Menu"
                      className="relative ml-auto grid size-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.06] text-muted-foreground transition hover:text-foreground lg:hidden"
                    />
                  }
                >
                  <Menu className="size-4" />
                </SheetTrigger>
                {/* No `relative` here. These classes are merged over the base
                    ones, and it would beat the `fixed` that positions the
                    panel — taking `inset-y-0 left-0 h-full` with it and
                    collapsing the drawer to nothing. `fixed` already anchors
                    the absolutely-positioned texture inside. */}
                <SheetContent
                  side="left"
                  className="flex w-[19rem] flex-col overflow-hidden bg-sidebar p-0"
                >
                  <SheetTitle className="sr-only">Menu</SheetTitle>
                  {railTexture}

                  <div className="relative z-10 flex min-h-0 flex-1 flex-col">
                    {brandAndNav}
                    <div className="min-h-0 flex-1" />
                    {credit}
                  </div>
                </SheetContent>
              </Sheet>
            </div>

            {/* One place sets the page gutter and bottom room, so routes only
                decide their own vertical rhythm and cannot drift apart. The
                gap below the header comes from the header itself, so this
                needs no top padding of its own. */}
            <div className="px-4 pb-16 pt-4 sm:px-6 sm:pt-5 lg:px-8">{children}</div>
          </main>

          {playerBar}
        </div>
      </div>

      {/* Mounted once here, regardless of route, so any heart in the app can
          fire into it. */}
      <LikeBurstHost />
    </FrameContext.Provider>
  );
}
