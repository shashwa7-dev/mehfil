"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  /**
   * Service worker registration and update handling.
   *
   * Registration alone is what makes the app installable, but an installed PWA
   * can sit open for days, so it also has to notice new deploys. Three parts:
   *
   *   updateViaCache: "none"  the worker script itself is never served from
   *                           the HTTP cache, or a new deploy could go
   *                           unnoticed for up to 24 hours.
   *   update() on focus       installed apps rarely reload on their own, so
   *                           returning to the tab is the natural check point.
   *   controllerchange        a new worker has taken over, meaning the page is
   *                           running against a superseded build — reload once
   *                           so the user lands on the current one.
   */
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // Never in development. The worker caches build assets, which change on
    // every edit, so it serves stale chunks and makes changes appear not to
    // land. Any worker left over from a previous dev session is unregistered
    // and its caches dropped, since it would otherwise keep intercepting.
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => registration.unregister());
      });
      if ("caches" in window) {
        caches.keys().then((keys) => keys.forEach((key) => caches.delete(key)));
      }
      return;
    }

    // Captured before registering: on a first install `controllerchange` also
    // fires, and reloading then would be a pointless refresh on first visit.
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloading = false;
    let registration: ServiceWorkerRegistration | undefined;

    const onControllerChange = () => {
      if (!hadController || reloading) return;
      reloading = true;
      window.location.reload();
    };

    const checkForUpdate = () => {
      if (document.visibilityState === "visible") registration?.update().catch(() => {});
    };

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .then((reg) => {
          registration = reg;
        })
        .catch(() => {});
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    document.addEventListener("visibilitychange", checkForUpdate);

    // Wait for load so registration never competes with the first paint.
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", checkForUpdate);
    };
  }, []);

  // Created in state so the client is stable across re-renders but never
  // shared between requests.
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // The catalogue is a static asset that only changes when the
            // pipeline re-exports, so there is nothing to revalidate against.
            staleTime: Infinity,
            gcTime: Infinity,
            refetchOnWindowFocus: false,
            retry: 2,
          },
        },
      })
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
