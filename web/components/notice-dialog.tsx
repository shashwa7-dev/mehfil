"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Play } from "lucide-react";
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
 * The one-time welcome: what this app does not own, and what it does not store.
 *
 * Framed as a greeting rather than a consent gate, because that is what it is —
 * nothing here needs agreeing to, and there is no version of this someone can
 * decline. Saying it warmly costs nothing and reads as courtesy instead of
 * paperwork.
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
      {/* Capped in height, wider than the primitive, and scrolling nothing
          itself.

          Nothing scrolls here because scrolling the popup would carry the
          picture and the OK button off with the text, which is how a confirm
          button ends up somewhere the eye has to go looking for it. The cap
          stays so a short viewport cannot push the dialog past the screen
          edges; the text below handles its own overflow.

          The width override exists because the primitive's presets top out at
          20rem on a phone and 24rem from sm — sized for a sentence and a pair
          of buttons, which with a picture above the text reads as a column. It
          has to repeat the data-[size] variant rather than set a bare max-w-*:
          tailwind-merge treats differently-modified utilities as unrelated, so
          a plain one would leave both in place and lose to the attribute
          selector's specificity. */}
      <AlertDialogContent className="max-h-[85vh] overflow-hidden data-[size=default]:max-w-[calc(100vw-2rem)] data-[size=default]:sm:max-w-[475px]">
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
            no business depending on. 200px against a 475px card; on a short
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
            className="h-[200px] w-full object-cover motion-reduce:hidden [@media(max-height:500px)]:h-24"
          >
            <source src="/notice.mp4" type="video/mp4" />
          </video>
          <img
            src="/notice.jpg"
            alt=""
            aria-hidden
            className="hidden h-[200px] w-full object-cover motion-reduce:block [@media(max-height:500px)]:h-24"
          />
        </div>
        <AlertDialogHeader>
          {/* The primitive's title is text-base font-medium — the same size as the
              body beneath it, so it reads as a first line rather than a title.
              text-xl against the description's text-sm gives it somewhere to
              stand. leading-tight matches the page headings elsewhere. */}
          <AlertDialogTitle className="text-xl leading-tight">
            Welcome to Mehfil
          </AlertDialogTitle>
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
              Nearly four thousand songs from the golden age of Hindi film
              music, and not one of them ours. They play through YouTube&apos;s
              own player and the cover art is theirs. The backdrops are
              illustrations we could not trace; tell us if one is yours and we
              will credit it or remove it.
            </p>
            <p>
              Nothing you do here leaves this browser. No account, no server, no
              tracking. Installing Mehfil to your home screen changes none of
              that: it asks for no permissions and sends nothing anywhere.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {/* An invitation rather than an acknowledgement. "OK" asks someone to
              confirm they have read terms; this is a welcome, and the only
              thing waiting on the other side of it is the music. The icon is
              filled to match the play controls it is about to hand them. */}
          <AlertDialogAction className="gap-2" onClick={() => handleOpenChange(false)}>
            {/* gap-2 explicitly: the button base sets items-center and sizes
                svg children, but no gap, so an icon beside a label would sit
                flush against it. The other icon-and-text buttons in the app
                set their own for the same reason. */}
            <Play className="size-4 fill-current" />
            Let the music play
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
