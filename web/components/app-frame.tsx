"use client";

import { createContext, useContext, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutGrid, ListMusic, Menu, Search, X } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { InstallButton } from "@/components/install-prompt";
import { usePlayerBar } from "@/components/player-provider";
import { useCatalogue } from "@/lib/queries";

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

  const onBrowse = pathname === "/";

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
        <Link href="/songs" className={navClass(!onBrowse)}>
          <ListMusic className="size-4" /> All songs
        </Link>
        <InstallButton />
      </div>
    </>
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
          {/* Texture for the space the filter panel leaves empty. Masked to
              nothing well before it reaches the navigation, and desaturated
              toward the brass palette, so it reads as a surface rather than a
              picture competing with the controls in front of it. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 top-1/3 [mask-image:linear-gradient(to_top,#000_0%,#000_35%,transparent_100%)]"
          >
            <img
              src="/collage.jpg"
              alt=""
              className="size-full object-cover opacity-[0.16] saturate-[0.55] sepia-[0.35]"
            />
          </div>

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
            className="scroll-slim min-h-0 flex-1 overflow-y-auto rounded-none bg-gradient-to-b from-white/[0.06] to-transparent lg:rounded-lg"
          >
            {/* Gutter must match the content below exactly, or the search box
                sits on a different edge from everything it sits above. */}
            <div className="sticky top-0 z-20 flex items-center gap-2 bg-background/70 px-4 pb-4 pt-3 backdrop-blur sm:px-6 lg:px-8">
              <Link href="/" className="flex shrink-0 items-center gap-2 lg:hidden">
                <img src="/logo.png" alt="" width={32} height={32} className="size-8 rounded-lg" />
              </Link>

              <div className="relative w-full max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    // Searching from anywhere lands on the list that can show
                    // results, rather than silently doing nothing.
                    if (pathname !== "/songs" && e.target.value) router.push("/songs");
                  }}
                  placeholder="Search songs, films, singers…"
                  className="h-9 w-full rounded-full border border-white/10 bg-white/[0.06] pl-9 pr-8 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/50"
                />
                {query && (
                  <button
                    onClick={() => setQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>

              <Sheet>
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
                <SheetContent
                  side="left"
                  className="relative flex w-[19rem] flex-col overflow-hidden bg-sidebar p-0"
                >
                  <SheetTitle className="sr-only">Menu</SheetTitle>
                  {/* Same treatment as the rail, different artwork — the menu
                      has the same blank stretch to fill and should not look
                      like a plainer version of the desktop chrome. */}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 bottom-0 top-1/3 [mask-image:linear-gradient(to_top,#000_0%,#000_35%,transparent_100%)]"
                  >
                    <img
                      src="/collage-bazaar.jpg"
                      alt=""
                      className="size-full object-cover opacity-[0.16] saturate-[0.55] sepia-[0.35]"
                    />
                  </div>

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
            <div className="px-4 pb-16 sm:px-6 lg:px-8">{children}</div>
          </main>

          {playerBar}
        </div>
      </div>
    </FrameContext.Provider>
  );
}
