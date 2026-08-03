"use client";

import { useEffect, useState } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";

const DISMISSED_KEY = "mehfil.installDismissed";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Install prompt.
 *
 * Chromium fires `beforeinstallprompt` and lets us trigger the real dialog.
 * Safari fires nothing and has no API, so iOS gets instructions for the
 * Share -> Add to Home Screen flow instead. Without that branch iOS users
 * would never see a prompt at all.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Already installed: standalone display mode, or Safari's own flag.
    const installed =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    if (installed) return;

    try {
      if (localStorage.getItem(DISMISSED_KEY)) return;
    } catch {
      // Storage unavailable; treat as not dismissed.
    }

    const ua = window.navigator.userAgent;
    // iPadOS reports as Mac, so touch support disambiguates it.
    const ios =
      /iphone|ipod/i.test(ua) ||
      (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1) ||
      /ipad/i.test(ua);

    if (ios) {
      setIsIOS(true);
      setShow(true);
      return;
    }

    const onPrompt = (e: Event) => {
      // Keep the event so the dialog can be opened from our own button later.
      e.preventDefault();
      setDeferred(e as InstallEvent);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Nothing to do; it will offer again next visit.
    }
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    dismiss();
  };

  if (!show) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[88px] z-[80] flex justify-center px-3">
      <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl border border-white/10 bg-card/95 p-3 shadow-2xl backdrop-blur">
        <img src="/logo.png" alt="" width={40} height={40} className="size-10 rounded-lg" />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Install Mehfil</p>
          {isIOS ? (
            <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              Tap <Share className="inline size-3" /> then
              <span className="inline-flex items-center gap-1">
                <SquarePlus className="inline size-3" /> Add to Home Screen
              </span>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Full screen, no browser bars
            </p>
          )}
        </div>

        {!isIOS && (
          <button
            onClick={install}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:opacity-90"
          >
            <Download className="size-3.5" /> Install
          </button>
        )}

        <button
          onClick={dismiss}
          title="Dismiss"
          className="shrink-0 rounded-full p-1.5 text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
