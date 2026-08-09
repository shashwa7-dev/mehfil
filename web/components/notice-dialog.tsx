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
      {/* Capped, but nothing scrolls at this level. Scrolling the whole popup
          would carry the picture and the OK button away with the text, which
          is how the button ends up somewhere the eye has to go looking for it.
          The height cap stays so a short viewport cannot push the dialog past
          the screen edges; the overflow is handled by the text alone, below. */}
      <AlertDialogContent className="max-h-[85vh] overflow-hidden">
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
        {/* Faded out at the bottom rather than stopped. A picture that ends on
            a hard horizontal line reads as a banner bolted above the text; the
            same picture dissolving into the card's own background reads as
            part of it. The same trick the player bar uses on its artwork and
            song-details uses on its corner wash. */}
        <div className="-mx-4 -mt-4 overflow-hidden rounded-t-xl [mask-image:linear-gradient(to_bottom,#000_0%,#000_55%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,#000_0%,#000_55%,transparent_100%)]">
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
          {/* A div rather than the default <p>, so two paragraphs can sit
              inside without nesting a <p> in a <p>. The description id, and so
              the aria-describedby wiring, moves with the render override, so
              both are still announced as the dialog's description.

              This is the only thing that scrolls. Bounding it here rather than
              on the popup keeps the picture and the OK button fixed while long
              text moves under them. */}
          <AlertDialogDescription
            render={<div className="max-h-[38vh] space-y-3 overflow-y-auto text-left" />}
          >
            <p>
              Nothing here is ours. Songs play through YouTube&apos;s own player
              and the cover art is theirs. The backdrops are illustrations we
              could not trace; tell us if one is yours and we will credit it or
              remove it.
            </p>
            <p>
              Nothing is stored beyond this browser. No account, no server, no
              tracking. Installing Mehfil to your home screen changes none of
              that: it asks for no permissions and sends nothing anywhere.
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
