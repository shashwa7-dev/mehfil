"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";

const DISMISSED_KEY = "mehfil.installDismissed";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Module-level capture of `beforeinstallprompt`.
 *
 * The event fires once, and Chrome commonly fires it before React has
 * hydrated. Listening from inside an effect therefore misses it outright, and
 * Android falls back to manual instructions even though a real install was
 * available. Listening at import time is early enough to catch it, and the
 * event is stashed so any component mounting later can still use it.
 */
let capturedPrompt: InstallEvent | null = null;
const promptListeners = new Set<(e: InstallEvent | null) => void>();

function setCapturedPrompt(event: InstallEvent | null) {
  capturedPrompt = event;
  promptListeners.forEach((fn) => fn(event));
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    // Held back so our own control can open the dialog on demand.
    e.preventDefault();
    setCapturedPrompt(e as InstallEvent);
  });
  window.addEventListener("appinstalled", () => setCapturedPrompt(null));
}

/**
 * Install state, shared by the banner and any other install control.
 *
 * Chromium fires `beforeinstallprompt` and lets us open the real dialog on
 * demand. Safari fires nothing and exposes no API, so iOS can only be given
 * instructions for Share -> Add to Home Screen. Both branches are needed or
 * one platform silently gets no prompt at all.
 */
export function useInstall() {
  // Seeded from the module-level capture, so a prompt that arrived before this
  // component mounted is still available.
  const [deferred, setDeferred] = useState<InstallEvent | null>(capturedPrompt);
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

    // Pick up a prompt that arrives after mount, and clear it once installed.
    setDeferred(capturedPrompt);
    promptListeners.add(setDeferred);
    const onInstalled = () => setInstalled(true);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      promptListeners.delete(setDeferred);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (deferred) {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      // The event is single-use; a declined prompt cannot be replayed.
      setCapturedPrompt(null);
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

/**
 * Permanent install control for the drawer.
 *
 * Always rendered unless already installed. Gating it on `canInstall` meant it
 * was invisible on any browser that had not fired `beforeinstallprompt`, which
 * is most of them — so the entry point people look for simply was not there.
 * Where no programmatic install exists, it explains the manual route instead
 * of doing nothing.
 */
export function InstallButton({ className = "" }: { className?: string }) {
  const { install, installed, isIOS, canInstall, showIOSHelp, dismissIOSHelp } =
    useInstall();
  const [showHelp, setShowHelp] = useState(false);

  if (installed) return null;

  return (
    <>
      <button
        onClick={() => (canInstall ? install() : setShowHelp(true))}
        className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition hover:bg-white/[0.06] hover:text-foreground ${className}`}
      >
        <Download className="size-4" /> Install Mehfil
      </button>
      {showIOSHelp && <IOSInstallHelp onClose={dismissIOSHelp} />}
      {showHelp && !isIOS && <ManualInstallHelp onClose={() => setShowHelp(false)} />}
    </>
  );
}

/** Fallback for browsers with no install API and no prompt event. */
function ManualInstallHelp({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-card p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="" width={40} height={40} className="size-10 rounded-lg" />
            <div>
              <p className="text-sm font-medium">Install Mehfil</p>
              <p className="text-xs text-muted-foreground">From your browser menu</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
          <li>
            <span className="text-foreground">Chrome / Edge</span> — the install icon
            in the address bar, or menu → Install
          </li>
          <li>
            <span className="text-foreground">Android</span> — menu → Add to Home screen
          </li>
          <li>
            <span className="text-foreground">Firefox</span> — menu → Install
          </li>
        </ul>

        <p className="mt-4 text-xs text-muted-foreground">
          If none appear, the browser may not support installing web apps.
        </p>
      </div>
    </div>
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
