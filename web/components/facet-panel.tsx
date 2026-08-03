"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { FACET_LABEL, facetCounts, type Catalogue, type RawSong } from "@/lib/catalogue";

const OPEN_BY_DEFAULT = new Set(["stations", "moods"]);
const SEARCH_THRESHOLD = 10;
const VISIBLE_ROWS = 50;

type Option = { label: string; index: number; count: number };

function OptionRow({
  option,
  on,
  onToggle,
}: {
  option: Option;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition hover:bg-white/[0.06] ${
        on ? "text-primary" : "text-foreground/85"
      }`}
    >
      <span
        className={`grid size-3.5 shrink-0 place-items-center rounded-[3px] border transition ${
          on ? "border-primary bg-primary" : "border-white/25"
        }`}
      >
        {on && <Check className="size-2.5 text-primary-foreground" />}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs">{option.label}</span>
      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
        {option.count.toLocaleString()}
      </span>
    </button>
  );
}

function FacetSection({
  facet,
  options,
  selected,
  forceOpen,
  onToggle,
  onClearFacet,
}: {
  facet: string;
  options: Option[];
  selected: Set<number>;
  forceOpen: boolean;
  onToggle: (facet: string, index: number) => void;
  onClearFacet: (facet: string) => void;
}) {
  const [open, setOpen] = useState(OPEN_BY_DEFAULT.has(facet));
  const [needle, setNeedle] = useState("");

  const shown = useMemo(() => {
    const q = needle.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, needle]);

  if (options.length === 0) return null;
  // A global search forces every matching section open, so results aren't hidden.
  const expanded = forceOpen || open;

  return (
    <div className="border-b border-white/[0.06] last:border-0">
      <div className="flex items-center">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex flex-1 items-center gap-2 px-4 py-2.5 text-left transition hover:bg-white/[0.04]"
        >
          <ChevronDown
            className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${
              expanded ? "" : "-rotate-90"
            }`}
          />
          <span className="flex-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {FACET_LABEL[facet]}
          </span>
          {selected.size > 0 && (
            <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              {selected.size}
            </span>
          )}
        </button>
        {selected.size > 0 && (
          <button
            onClick={() => onClearFacet(facet)}
            title={`Clear ${FACET_LABEL[facet]}`}
            className="px-3 text-muted-foreground transition hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        )}
      </div>

      {expanded && (
        <div className="pb-2">
          {options.length > SEARCH_THRESHOLD && !forceOpen && (
            <div className="relative px-3 pb-2">
              <Search className="pointer-events-none absolute left-5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
              <input
                value={needle}
                onChange={(e) => setNeedle(e.target.value)}
                placeholder={`Find ${FACET_LABEL[facet].toLowerCase()}…`}
                className="h-7 w-full rounded-md border border-white/10 bg-white/[0.04] pl-7 pr-2 text-xs outline-none placeholder:text-muted-foreground focus:border-primary/40"
              />
            </div>
          )}

          <div className="scroll-slim max-h-64 overflow-y-auto px-1.5">
            {shown.slice(0, VISIBLE_ROWS).map((option) => (
              <OptionRow
                key={option.index}
                option={option}
                on={selected.has(option.index)}
                onToggle={() => onToggle(facet, option.index)}
              />
            ))}
            {shown.length > VISIBLE_ROWS && (
              <p className="px-2 py-1.5 text-[10px] text-muted-foreground">
                {(shown.length - VISIBLE_ROWS).toLocaleString()} more — type to narrow
              </p>
            )}
            {shown.length === 0 && (
              <p className="px-2 py-1.5 text-[10px] text-muted-foreground">No match</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function FacetPanel({
  catalogue,
  results,
  selected,
  onToggle,
  onClear,
}: {
  catalogue: Catalogue;
  results: RawSong[];
  selected: Record<string, Set<number>>;
  onToggle: (facet: string, index: number) => void;
  onClear: () => void;
}) {
  const [globalNeedle, setGlobalNeedle] = useState("");
  const active = Object.values(selected).reduce((n, s) => n + s.size, 0);

  // One pass per facet per result-set change, rather than per section render.
  const counts = useMemo(
    () =>
      Object.fromEntries(
        Object.keys(FACET_LABEL).map((facet) => [facet, facetCounts(results, facet)])
      ),
    [results]
  );

  const query = globalNeedle.trim().toLowerCase();

  // Options per facet: reachable from current results, selected pinned first,
  // then narrowed by the cross-facet search when one is active.
  const optionsByFacet = useMemo(() => {
    const out: Record<string, Option[]> = {};
    for (const facet of Object.keys(FACET_LABEL)) {
      const values = catalogue.facets[facet as keyof Catalogue["facets"]];
      const chosen = selected[facet] ?? new Set<number>();
      let list = values
        .map((label, index) => ({ label, index, count: counts[facet].get(index) ?? 0 }))
        .filter((o) => o.count > 0 || chosen.has(o.index));
      list.sort(
        (a, b) =>
          Number(chosen.has(b.index)) - Number(chosen.has(a.index)) ||
          b.count - a.count ||
          a.label.localeCompare(b.label)
      );
      if (query) list = list.filter((o) => o.label.toLowerCase().includes(query));
      out[facet] = list;
    }
    return out;
  }, [catalogue, counts, selected, query]);

  const chips = useMemo(
    () =>
      Object.entries(selected).flatMap(([facet, set]) =>
        [...set].map((index) => ({
          facet,
          index,
          label: catalogue.facets[facet as keyof Catalogue["facets"]][index],
        }))
      ),
    [catalogue, selected]
  );

  const clearFacet = (facet: string) => {
    const next = { ...selected };
    delete next[facet];
    // Rebuild via toggles so the parent stays the single source of truth.
    for (const index of selected[facet] ?? []) onToggle(facet, index);
  };

  const totalMatches = query
    ? Object.values(optionsByFacet).reduce((n, list) => n + list.length, 0)
    : 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-2 border-b border-white/[0.06] px-3 py-2.5">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-semibold uppercase tracking-wide">Filters</span>
          {active > 0 && (
            <button
              onClick={onClear}
              className="text-[11px] text-muted-foreground transition hover:text-foreground"
            >
              Clear all
            </button>
          )}
        </div>

        {/* Searches every facet at once, so you needn't know whether someone
            is filed under composer or lyricist to find them. */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
          <input
            value={globalNeedle}
            onChange={(e) => setGlobalNeedle(e.target.value)}
            placeholder="Find any filter…"
            className="h-7 w-full rounded-md border border-white/10 bg-white/[0.05] pl-7 pr-6 text-xs outline-none placeholder:text-muted-foreground focus:border-primary/40"
          />
          {globalNeedle && (
            <button
              onClick={() => setGlobalNeedle("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
        {query && (
          <p className="px-1 text-[10px] text-muted-foreground">
            {totalMatches.toLocaleString()} matching {totalMatches === 1 ? "filter" : "filters"}
          </p>
        )}

        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {chips.map((chip) => (
              <button
                key={`${chip.facet}-${chip.index}`}
                onClick={() => onToggle(chip.facet, chip.index)}
                title={`Remove ${chip.label}`}
                className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] text-primary transition hover:bg-primary/25"
              >
                <span className="truncate">{chip.label}</span>
                <X className="size-2.5 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="scroll-slim min-h-0 flex-1 overflow-y-auto">
        {Object.keys(FACET_LABEL).map((facet) => (
          <FacetSection
            key={facet}
            facet={facet}
            options={optionsByFacet[facet]}
            selected={selected[facet] ?? new Set()}
            forceOpen={query.length > 0}
            onToggle={onToggle}
            onClearFacet={clearFacet}
          />
        ))}
      </div>
    </div>
  );
}
