"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ListMusic, Play } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { BrowseGrid } from "@/components/browse-grid";
import { CatalogueGate } from "@/components/catalogue-gate";
import { InstallPrompt } from "@/components/install-prompt";
import { usePlayer } from "@/components/player-provider";
import { filterSongs, type Catalogue } from "@/lib/catalogue";
import { collectionHref } from "@/lib/routes";
import { useCatalogue } from "@/lib/queries";

export default function BrowsePage() {
  const { data: catalogue, isLoading, isError, error } = useCatalogue();
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);
  const router = useRouter();
  const { playFirst } = usePlayer();

  return (
    <CatalogueGate isLoading={isLoading} isError={isError} error={error}>
      {catalogue && (
        <AppShell catalogue={catalogue} onScrollElement={setScrollEl}>
          <h2 className="pb-3 pt-2 text-2xl">Browse</h2>

          {/* The rail carries this on desktop; below lg it is the only way to
              reach the whole catalogue from here. */}
          <Link
            href="/songs"
            className="mb-4 flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.05] p-3 transition hover:bg-white/[0.09] lg:hidden"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
              <ListMusic className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">All songs</span>
              <span className="block text-xs text-muted-foreground">
                {catalogue.songs.length.toLocaleString()} tracks · shuffle or search
              </span>
            </span>
            <Play className="size-4 shrink-0 fill-current text-muted-foreground" />
          </Link>

          <BrowseGrid
            catalogue={catalogue}
            scrollParent={scrollEl}
            onPick={(facet, index) =>
              router.push(
                collectionHref(
                  facet,
                  catalogue.facets[facet as keyof Catalogue["facets"]][index]
                )
              )
            }
            onPlay={(facet, index) => {
              // Start immediately and open the collection, so the play button
              // is not just a slower route link.
              const label = catalogue.facets[facet as keyof Catalogue["facets"]][index];
              playFirst(filterSongs(catalogue, { [facet]: new Set([index]) }, ""));
              router.push(collectionHref(facet, label));
            }}
          />
        </AppShell>
      )}
      <InstallPrompt />
    </CatalogueGate>
  );
}
