/**
 * Serialisation for the browsable view state.
 *
 * Kept as free functions rather than inside the hook so they can be tested
 * directly: given state in, plain JSON out, and back again. History entries go
 * through `structuredClone`, which rejects `Set`, so the facet selection has to
 * be flattened to arrays on the way in and rebuilt on the way out.
 */

export type Selection = Record<string, Set<number>>;

/** Plain, structured-cloneable shape stored in a history entry. */
export type ViewState = {
  query: string;
  facets: Record<string, number[]>;
  list: boolean;
};

export function serialiseView(
  selection: Selection,
  query: string,
  list: boolean
): ViewState {
  return {
    query,
    facets: Object.fromEntries(
      Object.entries(selection)
        .filter(([, values]) => values.size > 0)
        .map(([facet, values]) => [facet, [...values].sort((a, b) => a - b)])
    ),
    list,
  };
}

export function deserialiseView(view: ViewState): {
  selection: Selection;
  query: string;
  list: boolean;
} {
  return {
    selection: Object.fromEntries(
      Object.entries(view.facets).map(([facet, values]) => [facet, new Set(values)])
    ),
    query: view.query,
    list: view.list,
  };
}

/**
 * Identity of a view as a *navigation step*.
 *
 * Deliberately excludes the search text. Treating every keystroke as a step
 * would bury the history stack and make the back gesture behave like a
 * backspace, so typing refines the current entry instead of creating one.
 */
export function viewStepKey(view: ViewState): string {
  const facets = Object.keys(view.facets)
    .sort()
    .map((facet) => `${facet}:${view.facets[facet].join(",")}`)
    .join("|");
  return `${view.list ? "list" : "browse"}#${facets}`;
}
