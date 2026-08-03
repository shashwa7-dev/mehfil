"use client";

import { useEffect, useRef } from "react";

export type HistoryStateOptions<T> = {
  /** Current state, in a form `structuredClone` accepts. */
  value: T;
  /**
   * Identity of `value` as a navigation step. Two values sharing a key refine
   * the same entry; a change pushes a new one. Returning a constant makes
   * every update a replace.
   */
  stepKey: (value: T) => string;
  /** Applies a state popped off the stack. Must not itself push. */
  onRestore: (value: T) => void;
  /** Distinguishes these entries from any other pushed by the app. */
  namespace: string;
  /** Skip while the data the state refers to has not loaded yet. */
  enabled?: boolean;
};

/**
 * Mirrors component state into the history stack.
 *
 * A single-route app has one history entry, so the back gesture leaves it from
 * anywhere — however deep the user has navigated in-app. Pushing an entry per
 * meaningful state change makes back retrace those steps, and exit only from
 * the genuine starting point, which is correct there.
 *
 * The push/replace split is the whole design: `stepKey` decides what counts as
 * navigation. Everything else refines the current entry rather than adding to
 * the stack.
 */
export function useHistoryState<T>({
  value,
  stepKey,
  onRestore,
  namespace,
  enabled = true,
}: HistoryStateOptions<T>) {
  // Kept in refs so changing callbacks never re-subscribe the popstate
  // listener, which would drop events during the swap.
  const restoreRef = useRef(onRestore);
  restoreRef.current = onRestore;
  const stepKeyRef = useRef(stepKey);
  stepKeyRef.current = stepKey;

  const lastStepRef = useRef<string | null>(null);
  const restoringRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const onPop = (event: PopStateEvent) => {
      const entry = (event.state as Record<string, T> | null)?.[namespace];
      if (entry === undefined) return;
      // Marks the state change as externally driven so the sync effect below
      // records it without pushing, which would otherwise fight the back
      // gesture by re-adding what was just popped.
      restoringRef.current = true;
      lastStepRef.current = stepKeyRef.current(entry);
      restoreRef.current(entry);
    };

    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [namespace, enabled]);

  useEffect(() => {
    if (!enabled) return;

    const step = stepKeyRef.current(value);
    const isFirst = lastStepRef.current === null;
    const isNewStep = !isFirst && step !== lastStepRef.current;
    lastStepRef.current = step;

    if (restoringRef.current) {
      restoringRef.current = false;
      return;
    }

    const entry = { ...(window.history.state ?? {}), [namespace]: value };
    if (isNewStep) window.history.pushState(entry, "");
    else window.history.replaceState(entry, "");
  }, [value, namespace, enabled]);
}
