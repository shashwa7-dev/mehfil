"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";

const DISMISSED_KEY = "mehfil.installDismissed";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Install state, shared by the banner and any other install control.
 *
 * Chromium fires `beforeinstallprompt` and lets us open the real dialog on
 * demand. Safari fires nothing and exposes no API, so iOS can only be given
 * instructions for Share -> Add to Home Screen. Both branches are needed or
 * one platform silently gets no prompt at all.
 */
export function useInstall() {
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [showIOSHelp, setShowIOSHelp] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    if (standalone) {
      setInstalled(true);
      return;
    }

    const ua = window.navigator.userAgent;
    // iPadOS reports as a Mac, so touch support is what separates them.
    setIsIOS(
      /iphone|ipod|ipad/i.test(ua) ||
        (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
    );

    const onPrompt = (e: Event) => {
      // Held back so our own control can open the dialog later.
      e.preventDefault();
      setDeferred(e as InstallEvent);
    };
    const onInstalled = () => setInstalled(true);

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (deferred) {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      // The event is single-use; a declined prompt cannot be replayed.
      setDeferred(null);
      if (outcome === "accepted") setInstalled(true);
      return;
    }
    // No programmatic path on iOS — show the manual steps instead.
    if (isIOS) setShowIOSHelp(true);
  }, [deferred, isIOS]);

  return {
    install,
    installed,
    isIOS,
    showIOSHelp,
    dismissIOSHelp: () => setShowIOSHelp(false),
    // Offer the control whenever installing is actually possible.
    canInstall: !installed && (Boolean(deferred) || isIOS),
  };
}

/** Steps for Safari, which has no install API. */
export function IOSInstallHelp({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-card p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="" width={40} height={40} className="size-10 rounded-lg" />
            <div>
              <p className="text-sm font-medium">Install Mehfil</p>
              <p className="text-xs text-muted-foreground">Two taps in Safari</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <ol className="mt-4 space-y-3 text-sm">
          <li className="flex items-center gap-2.5">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-white/10 text-xs">
              1
            </span>
            Tap <Share className="size-4 text-primary" /> in the toolbar
          </li>
          <li className="flex items-center gap-2.5">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-white/10 text-xs">
              2
            </span>
            Choose <SquarePlus className="size-4 text-primary" /> Add to Home Screen
          </li>
        </ol>
      </div>
    </div>
  );
}

/** Reusable install control for the sidebar or anywhere else. */
export function InstallButton({ className = "" }: { className?: string }) {
  const { install, canInstall, showIOSHelp, dismissIOSHelp } = useInstall();
  if (!canInstall) return null;

  return (
    <>
      <button
        onClick={install}
        className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition hover:bg-white/[0.06] hover:text-foreground ${className}`}
      >
        <Download className="size-4" /> Install app
      </button>
      {showIOSHelp && <IOSInstallHelp onClose={dismissIOSHelp} />}
    </>
  );
}

/** One-time banner. Dismissal is remembered; the sidebar control is not. */
export function InstallPrompt() {
  const { install, canInstall, isIOS, showIOSHelp, dismissIOSHelp } = useInstall();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(Boolean(localStorage.getItem(DISMISSED_KEY)));
    } catch {
      setDismissed(false);
    }
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Storage unavailable; it will simply offer again next visit.
    }
  };

  if (dismissed || !canInstall) {
    return showIOSHelp ? <IOSInstallHelp onClose={dismissIOSHelp} /> : null;
  }

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-[96px] z-[80] flex justify-center px-3">
        <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl border border-white/10 bg-card/95 p-3 shadow-2xl backdrop-blur">
          <img src="/logo.png" alt="" width={40} height={40} className="size-10 rounded-lg" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Install Mehfil</p>
            <p className="text-xs text-muted-foreground">
              {isIOS ? "Add it to your home screen" : "Full screen, no browser bars"}
            </p>
          </div>
          <button
            onClick={install}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:opacity-90"
          >
            <Download className="size-3.5" /> Install
          </button>
          <button
            onClick={dismiss}
            title="Dismiss"
            className="shrink-0 rounded-full p-1.5 text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
      {showIOSHelp && <IOSInstallHelp onClose={dismissIOSHelp} />}
    </>
  );
}
