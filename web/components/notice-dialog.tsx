"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * The one-time notice: what this app does not own, and what it does not store.
 *
 * Unlike lib/favourites.ts and lib/backdrops.ts, this reads localStorage once,
 * from one component, so useSyncExternalStore's subscriber machinery buys
 * nothing here. A plain effect after mount is enough, and there is no
 * `mounted` flag either — the dialog starts closed, closed is also what the
 * server rendered, so there is no state to reconcile before the effect runs.
 *
 * /about is the deliberate exception: it reopens the dialog on every visit,
 * seen key or not, because that is where the project owner wants the notice
 * repeatable on demand rather than left to a first-run localStorage.
 */

const SEEN_KEY = "mehfil:notice-seen:v1";

function hasSeenNotice(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    // Private browsing refuses localStorage. Showing the notice again is the
    // safe failure: the alternative is a permissions notice that silently
    // never appears on a browser that cannot remember having shown it.
    return false;
  }
}

function markNoticeSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Nothing to persist to. The dialog opens again next visit, which is a
    // worse first run than a crash, not the app failing.
  }
}

export function NoticeDialog() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Read after mount, same as offline-notice.tsx: the server has no notion
    // of localStorage or the current route's storage state, so this can only
    // be decided once the client is up.
    if (pathname === "/about") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(true);
      return;
    }
    if (!hasSeenNotice()) setOpen(true);
  }, [pathname]);

  // Any close — the OK button, Escape — counts as having been shown. On
  // /about that write is a no-op the next time this effect runs, since the
  // route check above short-circuits before the stored key is even read.
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) markNoticeSeen();
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Two things, before you start</AlertDialogTitle>
          {/* Rendered as a div rather than the default <p>, purely so two
              paragraphs can sit inside it without nesting a <p> in a <p>.
              The description id — and so the aria-describedby wiring — moves
              with the render override, so both paragraphs are still announced
              as the dialog's description. */}
          <AlertDialogDescription render={<div className="space-y-3 text-left" />}>
            <p>
              Nothing here is ours to claim. The catalogue is metadata compiled
              from a public songlist; every track plays through YouTube&apos;s
              own embedded player; cover art is YouTube&apos;s video
              thumbnails. The backdrops under Themes are illustrations we have
              not been able to identify the artist of. Nothing is hosted or
              claimed by this project.
            </p>
            <p>
              Mehfil stores nothing either. There is no account, no server, no
              analytics, no tracking. The only things it remembers — your
              favourites and your chosen backdrop — live in this browser&apos;s
              own storage, on this device, and go nowhere else.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={() => handleOpenChange(false)}>
            OK
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
