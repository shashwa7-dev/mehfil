"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutGrid, ListMusic, Menu, Search, X } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { InstallButton } from "@/components/install-prompt";
import type { Catalogue } from "@/lib/catalogue";

/**
 * Frame shared by every route: brand, navigation, search and the scroll
 * container the virtualised lists measure against.
 *
 * A component rather than a nested layout, because pages need to hand it
 * things a layout cannot receive — the filter panel for the current result
 * set, and the scroll node the list attaches to. The player is not here: it
 * lives in the root layout so it survives navigation.
 */
export function AppShell({
  catalogue,
  filters,
  query,
  onQueryChange,
  onScrollElement,
  children,
}: {
  catalogue: Catalogue;
  /** Facet panel for this route, if it has one. */
  filters?: React.ReactNode;
  query?: string;
  onQueryChange?: (value: string) => void;
  onScrollElement: (element: HTMLElement | null) => void;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const onBrowse = pathname === "/";

  const navClass = (active: boolean) =>
    `flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition ${
      active ? "bg-white/[0.09] text-foreground" : "text-muted-foreground hover:text-foreground"
    }`;

  const sidebar = (
    <>
      <div className="shrink-0 px-4 pb-3 pt-4">
        <Link href="/" className="flex items-center gap-2.5">
          <img src="/logo.png" alt="" width={36} height={36} className="size-9 rounded-lg" />
          <span>
            <span className="block text-lg leading-tight tracking-tight">Mehfil</span>
            <span className="block text-xs text-muted-foreground">
              {catalogue.songs.length.toLocaleString()} songs ·{" "}
              {catalogue.facets.stations.length} stations
            </span>
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

      {filters && (
        <div className="min-h-0 flex-1 border-t border-white/[0.06]">{filters}</div>
      )}

      <div className="mt-auto shrink-0 border-t border-white/[0.06] px-4 py-2.5">
        <a
          href="https://shashwa7.in"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-muted-foreground transition hover:text-foreground"
        >
          Made with <span className="text-primary">♥</span> by shashwa7.in
        </a>
      </div>
    </>
  );

  return (
    // Fills the space the player provider leaves, rather than the whole
    // viewport, or the bar below it would be pushed off-screen.
    <div className="relative flex h-full flex-col">
      <div className="flex min-h-0 flex-1 gap-0 p-0 lg:gap-2 lg:p-2">
        <aside className="hidden w-72 shrink-0 flex-col overflow-hidden rounded-lg bg-sidebar lg:flex">
          {sidebar}
        </aside>

        <main
          ref={onScrollElement}
          className="scroll-slim min-w-0 flex-1 overflow-y-auto rounded-none bg-gradient-to-b from-white/[0.06] to-transparent lg:rounded-lg"
        >
          <div className="sticky top-0 z-20 flex items-center gap-2 bg-background/70 px-4 py-3 backdrop-blur sm:px-6">
            <Link href="/" className="flex shrink-0 items-center gap-2 lg:hidden">
              <img src="/logo.png" alt="" width={32} height={32} className="size-8 rounded-lg" />
            </Link>

            <div className="relative w-full max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query ?? ""}
                onChange={(e) =>
                  onQueryChange
                    ? onQueryChange(e.target.value)
                    : router.push(`/songs?q=${encodeURIComponent(e.target.value)}`)
                }
                placeholder="Search songs, films, singers…"
                className="h-9 w-full rounded-full border border-white/10 bg-white/[0.06] pl-9 pr-8 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/50"
              />
              {query && onQueryChange && (
                <button
                  onClick={() => onQueryChange("")}
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
              <SheetContent side="left" className="flex w-[19rem] flex-col bg-sidebar p-0">
                <SheetTitle className="sr-only">Menu</SheetTitle>
                {sidebar}
              </SheetContent>
            </Sheet>
          </div>

          <div className="px-4 pb-10 sm:px-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
