"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { FACET_LABEL, facetCounts, type Catalogue, type RawSong } from "@/lib/catalogue";

// Sections start closed apart from these two, so the panel opens scannable
// rather than as one long wall of options.
const OPEN_BY_DEFAULT = new Set(["stations", "moods"]);
const SEARCH_THRESHOLD = 10;
const VISIBLE_ROWS = 60;

function FacetSection({
  facet,
  values,
  counts,
  selected,
  onToggle,
}: {
  facet: string;
  values: string[];
  counts: Map<number, number>;
  selected: Set<number>;
  onToggle: (facet: string, index: number) => void;
}) {
  const [open, setOpen] = useState(OPEN_BY_DEFAULT.has(facet));
  const [needle, setNeedle] = useState("");

  const options = useMemo(() => {
    const list = values
      .map((label, index) => ({ label, index, count: counts.get(index) ?? 0 }))
      .filter((o) => o.count > 0 || selected.has(o.index));
    // Chosen values first so a selection never scrolls out of reach.
    list.sort(
      (a, b) =>
        Number(selected.has(b.index)) - Number(selected.has(a.index)) ||
        b.count - a.count ||
        a.label.localeCompare(b.label)
    );
    const q = needle.trim().toLowerCase();
    return q ? list.filter((o) => o.label.toLowerCase().includes(q)) : list;
  }, [values, counts, selected, needle]);

  if (options.length === 0) return null;

  return (
    <div className="border-b border-white/[0.06] last:border-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition hover:bg-white/[0.04]"
      >
        <ChevronDown
          className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${
            open ? "" : "-rotate-90"
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

      {open && (
        <div className="pb-2">
          {values.length > SEARCH_THRESHOLD && (
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
            {options.slice(0, VISIBLE_ROWS).map((option) => {
              const on = selected.has(option.index);
              return (
                <button
                  key={option.index}
                  onClick={() => onToggle(facet, option.index)}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition hover:bg-white/[0.06] ${
                    on ? "text-primary" : "text-foreground/85"
                  }`}
                >
                  <span
                    className={`grid size-3.5 shrink-0 place-items-center rounded-[3px] border ${
                      on ? "border-primary bg-primary" : "border-white/25"
                    }`}
                  >
                    {on && <Check className="size-2.5 text-primary-foreground" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs">{option.label}</span>
                  <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                    {option.count}
                  </span>
                </button>
              );
            })}
            {options.length > VISIBLE_ROWS && (
              <p className="px-2 py-1.5 text-[10px] text-muted-foreground">
                {options.length - VISIBLE_ROWS} more — type to narrow
              </p>
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
  const active = Object.values(selected).reduce((n, s) => n + s.size, 0);

  // One pass per facet per result-set change. Computing this inline in the
  // render map re-scanned every song for all seven facets on every keystroke.
  const counts = useMemo(
    () =>
      Object.fromEntries(
        Object.keys(FACET_LABEL).map((facet) => [facet, facetCounts(results, facet)])
      ),
    [results]
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wide">Filters</span>
        {active > 0 && (
          <button
            onClick={onClear}
            className="text-[11px] text-muted-foreground transition hover:text-foreground"
          >
            Clear {active}
          </button>
        )}
      </div>

      {/* The scrolling element: min-h-0 lets it shrink inside the flex column,
          without which the panel grows past the viewport and never scrolls. */}
      <div className="scroll-slim min-h-0 flex-1 overflow-y-auto">
        {Object.keys(FACET_LABEL).map((facet) => (
          <FacetSection
            key={facet}
            facet={facet}
            values={catalogue.facets[facet as keyof Catalogue["facets"]]}
            counts={counts[facet]}
            selected={selected[facet] ?? new Set()}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  );
}
