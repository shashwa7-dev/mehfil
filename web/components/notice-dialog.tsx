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
      {/* The generated primitive centres the popup with no height cap, and a
          250px thumbnail plus three paragraphs is tall enough to overflow a
          short viewport — a landscape phone especially. Capping the height
          and scrolling the overflow keeps the dialog on-screen rather than
          letting it run past the top and bottom edges with the OK button
          unreachable. */}
      <AlertDialogContent className="max-h-[85vh] overflow-y-auto">
        {/* Full-bleed thumbnail, first inside the content so it sits above
            the header. AlertDialogContent pads and gaps its children (p-4,
            gap-4) for the header/footer case; -mx-4 -mt-4 cancels that same
            padding on this one edge, the same trick AlertDialogFooter already
            uses at the opposite edge to sit flush with the popup's own
            bottom. rounded-t-xl + overflow-hidden then re-clip the video to
            match the popup's own top corners, since escaping the padding
            also escapes the popup's own clip.
            Same video-with-poster-fallback pattern as AppBackdrop, but fixed
            to this one clip rather than reading from the theme store — a
            notice illustration has no "current backdrop" to key off, and
            importing AppBackdrop here would wire this dialog to state it has
            no business depending on. 250px is the owner's brief; on a short
            (landscape-phone) viewport it drops to 96px so the media doesn't
            dominate what little height max-h-[85vh] leaves — the text is the
            part with the acknowledgement in it. */}
        <div className="-mx-4 -mt-4 overflow-hidden rounded-t-xl">
          <video
            autoPlay
            muted
            loop
            playsInline
            poster="/notice.jpg"
            aria-hidden
            className="h-[250px] w-full object-cover motion-reduce:hidden [@media(max-height:500px)]:h-24"
          >
            <source src="/notice.mp4" type="video/mp4" />
          </video>
          <img
            src="/notice.jpg"
            alt=""
            aria-hidden
            className="hidden h-[250px] w-full object-cover motion-reduce:block [@media(max-height:500px)]:h-24"
          />
        </div>
        <AlertDialogHeader>
          <AlertDialogTitle>Before you start</AlertDialogTitle>
          {/* Rendered as a div rather than the default <p>, purely so three
              short paragraphs can sit inside it without nesting a <p> in a
              <p>. The description id — and so the aria-describedby wiring —
              moves with the render override, so all three are still
              announced as the dialog's description. */}
          <AlertDialogDescription render={<div className="space-y-3 text-left" />}>
            <p>
              Nothing here is ours. Songs play through YouTube&apos;s own
              embedded player, and cover art is YouTube&apos;s thumbnails. The
              backdrops are illustrations we have not been able to trace to an
              artist — tell us if one is yours and we will credit it or take
              it down.
            </p>
            <p>
              Nothing is stored anywhere but this browser: no account, no
              server, no analytics, no tracking. Favourites and your chosen
              backdrop live on this device alone.
            </p>
            <p>
              Installing Mehfil to your home screen changes none of that. It
              asks for no permissions, reaches nothing else on your device,
              and still sends nothing anywhere — the same page, in its own
              window.
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
