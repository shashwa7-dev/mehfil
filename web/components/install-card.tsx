"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Download, Share } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DISMISSED_KEY, useInstall } from "@/components/install-prompt";

/**
 * The install invitation, as a card rather than a coloured row.
 *
 * Built on the same shape as the welcome — media above, a line of reasoning,
 * one action — because they are the same kind of moment and two different
 * treatments would read as two different apps.
 *
 * It never shares a screen with the welcome. The welcome is the first thing
 * anyone sees and asking to install in the same breath is asking for something
 * before having given anything; this waits until a visit *after* that was
 * dismissed, which is also when someone has had a reason to want it.
 */

/** The welcome's own key. Read, never written — see `seenBefore` below. */
const NOTICE_SEEN_KEY = "mehfil:notice-seen:v1";

export function InstallCard() {
  const pathname = usePathname();
  const { install, installed, isIOS, canInstall } = useInstall();
  const [eligible, setEligible] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      // Read once, on mount, and deliberately not again. The welcome writes its
      // key the moment it is dismissed, so re-reading later in the same session
      // would let this open the instant that one closed — two modals in a row,
      // the second asking for something. Reading at mount means "was it seen
      // before this page load", which is the question actually being asked.
      const seenBefore = Boolean(localStorage.getItem(NOTICE_SEEN_KEY));
      const alreadyAsked = Boolean(localStorage.getItem(DISMISSED_KEY));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEligible(seenBefore && !alreadyAsked);
    } catch {
      // No storage: never nudge. Without somewhere to record a refusal this
      // would ask again on every single load, which is worse than not asking.
      setEligible(false);
    }
  }, []);

  useEffect(() => {
    // /about reopens the welcome on every visit, so staying away keeps the two
    // from stacking there.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(eligible && canInstall && !installed && pathname !== "/about");
  }, [eligible, canInstall, installed, pathname]);

  function close() {
    setOpen(false);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Nothing to write to; eligible is already false in that case.
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      {/* Same geometry as the welcome: capped on dvh, wider than the
          primitive's presets, and scrolling nothing at this level. See
          notice-dialog.tsx for why each of those is what it is. */}
      <AlertDialogContent className="flex max-h-[85dvh] flex-col overflow-hidden data-[size=default]:max-w-[calc(100vw-2rem)] data-[size=default]:sm:max-w-[475px]">
        {/* The same video-with-poster block the welcome uses, and for the same
            reasons: h264 rather than the GIF it came from, because a GIF is
            decoded on the CPU and re-decoded every loop while a YouTube player
            may already be running; the still is both the poster and what
            anyone who has asked for reduced motion gets instead; and the mask
            fades it into the card so it ends in the background rather than on
            a hard line. 688K of GIF became 28K.

            object-cover, so it fills the card edge to edge. The source is 4:3
            against a much wider box, so covering crops top and bottom — and
            the two numbers here are the ones that survive it. At 220px the
            visible window is 208px of source, exactly what the character needs
            from headphones to feet; anything shorter cuts one end off whatever
            the position. 35% rather than centred, because the artwork sits
            high in its own frame with the shadow below it. */}
        <div className="-mx-4 -mt-4 overflow-hidden rounded-t-xl [mask-image:linear-gradient(to_bottom,#000_0%,#000_60%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,#000_0%,#000_60%,transparent_100%)]">
          <video
            autoPlay
            muted
            loop
            playsInline
            poster="/install.jpg"
            aria-hidden
            className="h-[220px] w-full object-cover object-[center_35%] motion-reduce:hidden [@media(max-height:500px)]:h-24"
          >
            <source src="/install.mp4" type="video/mp4" />
          </video>
          <img
            src="/install.jpg"
            alt=""
            aria-hidden
            className="hidden h-[220px] w-full object-cover object-[center_35%] motion-reduce:block [@media(max-height:500px)]:h-24"
          />
        </div>

        <AlertDialogHeader className="place-items-start text-left">
          <AlertDialogTitle className="text-xl leading-tight">
            Keep Mehfil on your {isIOS ? "home screen" : "device"}
          </AlertDialogTitle>
          <AlertDialogDescription
            render={<div className="space-y-3 text-left" />}
          >
            <p>
              It opens in its own window with no browser bars, keeps your
              favourites and your chosen backdrop, and starts where you left
              off.
            </p>
            <p>
              <strong className="font-medium text-primary">
                Completely safe.
              </strong>{" "}
              It is the same page you are on, in a window of its own. No
              permissions, no access to anything else on your device, and
              nothing sent anywhere.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter className="sm:justify-start">
          <AlertDialogAction className="gap-2" onClick={install}>
            {isIOS ? <Share className="size-4" /> : <Download className="size-4" />}
            {isIOS ? "Show me how" : "Install"}
          </AlertDialogAction>
          {/* Cancel rather than a second action: declining should be the plain
              one of the two, and this is the only way out on a phone — an
              alert dialog refuses outside-press by design. */}
          <AlertDialogCancel onClick={close}>Not now</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
