"use client";

import { useCallback, useEffect, useState } from "react";

/** The (still non-standard) install prompt event. */
export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

const DISMISS_KEY = "upsc-chronicle-install-dismissed";
/** How long a "not now" is respected before we offer again. */
const DISMISS_DAYS = 14;

/** True when the app is running from the home screen / app window. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: window-controls-overlay)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** iOS has no install prompt event — it needs the Share-sheet instructions. */
export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ reports as a Mac, but with touch points
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  );
}

export type InstallState = {
  /** The browser offered a native install prompt. */
  canInstall: boolean;
  /** Already installed / launched as an app. */
  installed: boolean;
  /** Needs the manual iOS "Add to Home Screen" flow. */
  needsIosInstructions: boolean;
  /** Fires the native prompt. Resolves to true when the user accepted. */
  promptInstall: () => Promise<boolean>;
  /** Whether the passive banner should be shown. */
  bannerVisible: boolean;
  /** Hide the banner for a fortnight. */
  dismissBanner: () => void;
};

/**
 * Tracks installability. `beforeinstallprompt` can fire before React mounts,
 * so `pwa-install-listener.ts` stashes the earliest event on `window` and we
 * read it back here.
 */
export function useInstall(): InstallState {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(true); // assume dismissed until read
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());
    setIos(isIos() && !isStandalone());

    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      const at = raw ? Number(raw) : 0;
      setDismissed(
        Boolean(at) && Date.now() - at < DISMISS_DAYS * 86_400_000,
      );
    } catch {
      setDismissed(false);
    }

    const stashed = (
      window as unknown as { __chronicleInstallEvent?: BeforeInstallPromptEvent }
    ).__chronicleInstallEvent;
    if (stashed) setEvent(stashed);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setEvent(null);
    };
    const display = window.matchMedia("(display-mode: standalone)");
    const onDisplayChange = () => setInstalled(isStandalone());

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    display.addEventListener("change", onDisplayChange);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      display.removeEventListener("change", onDisplayChange);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!event) return false;
    try {
      await event.prompt();
      const { outcome } = await event.userChoice;
      // The event can only be used once.
      setEvent(null);
      delete (window as unknown as { __chronicleInstallEvent?: unknown })
        .__chronicleInstallEvent;
      if (outcome === "accepted") setInstalled(true);
      return outcome === "accepted";
    } catch {
      return false;
    }
  }, [event]);

  const dismissBanner = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* storage unavailable — the banner simply returns next session */
    }
  }, []);

  const canInstall = Boolean(event) && !installed;

  return {
    canInstall,
    installed,
    needsIosInstructions: ios,
    promptInstall,
    bannerVisible: !installed && !dismissed && (canInstall || ios),
    dismissBanner,
  };
}

/** Registers the service worker and reports when a new build is waiting. */
export function useServiceWorker() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    setOffline(!navigator.onLine);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;
    let reg: ServiceWorkerRegistration | undefined;

    const track = (r: ServiceWorkerRegistration) => {
      if (r.waiting && navigator.serviceWorker.controller) setWaiting(r.waiting);
      r.addEventListener("updatefound", () => {
        const incoming = r.installing;
        if (!incoming) return;
        incoming.addEventListener("statechange", () => {
          if (
            incoming.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            if (!cancelled) setWaiting(incoming);
          }
        });
      });
    };

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((r) => {
        if (cancelled) return;
        reg = r;
        track(r);
        // Look for a fresh build on load and hourly thereafter.
        r.update().catch(() => {});
      })
      .catch(() => {
        /* registration blocked (private mode, unsupported) — app still works */
      });

    const interval = window.setInterval(
      () => reg?.update().catch(() => {}),
      60 * 60 * 1000,
    );
    const onFocus = () => reg?.update().catch(() => {});
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const applyUpdate = useCallback(() => {
    if (!waiting) return;
    // Reload once the new worker takes over.
    const onControllerChange = () => window.location.reload();
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
      { once: true },
    );
    waiting.postMessage({ type: "SKIP_WAITING" });
    setWaiting(null);
  }, [waiting]);

  return { updateReady: Boolean(waiting), applyUpdate, offline };
}
