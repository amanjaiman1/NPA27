"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

/* ════════════════════════════════════════════════════════════════
   THE INSTALLABLE APP — the browser half
   Registering the service worker, and everything about installing:
   whether the browser can install the app right now, how to do it
   where there is no install prompt, and whether it already is.

   Imported by the public site as well as the app, so it must stay
   small and must not pull in the app's account or storage code.
   ════════════════════════════════════════════════════════════════ */

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

/**
 * Safari 17 or later on a Mac, which installs web apps from File → Add to
 * Dock and has no install prompt either. Best effort by nature: a wrong guess
 * only means the wrong instructions are offered, never a broken page.
 */
export function isMacSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (!/Macintosh/.test(ua) || navigator.maxTouchPoints > 1) return false;
  if (/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS/.test(ua)) return false;
  const version = /Version\/(\d+)/.exec(ua);
  return Boolean(version && Number(version[1]) >= 17 && /Safari\//.test(ua));
}

/* ── the service worker ──────────────────────────────────────────── */

let registering: Promise<ServiceWorkerRegistration | null> | null = null;

/**
 * Registers the service worker, once per page, on the public site and in the
 * app alike. It waits until the page has finished loading and the browser is
 * idle, so it never competes with what the visitor came to see.
 *
 * Production builds only: `next dev` is left alone so hot reload keeps
 * working. Resolves to null wherever there can be no worker (an old browser,
 * private browsing that blocks it, a page served over plain HTTP).
 */
export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (registering) return registering;
  if (
    typeof window === "undefined" ||
    process.env.NODE_ENV !== "production" ||
    !("serviceWorker" in navigator) ||
    !window.isSecureContext
  ) {
    return Promise.resolve(null);
  }
  registering = new Promise((resolve) => {
    const go = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).then(resolve, () => resolve(null));
    };
    // Safari has no requestIdleCallback; a timer is the next best thing.
    const idle = (window as Window & { requestIdleCallback?: Window["requestIdleCallback"] })
      .requestIdleCallback;
    const whenIdle = () => {
      if (idle) idle.call(window, go, { timeout: 3000 });
      else setTimeout(go, 1);
    };
    if (document.readyState === "complete") whenIdle();
    else window.addEventListener("load", whenIdle, { once: true });
  });
  return registering;
}

/* ── installing ──────────────────────────────────────────────────── */

/** How to install where the browser offers no prompt. */
export type ManualInstall = "ios" | "mac-safari" | null;

export interface InstallSnapshot {
  /** The browser's own install dialog is ready to be opened (Chrome, Edge, Android). */
  canPrompt: boolean;
  /** Running as the installed app right now. */
  standalone: boolean;
  /** Installed from this tab during this visit. */
  justInstalled: boolean;
  /** Instructions to give instead, where there is no install dialog. */
  manual: ManualInstall;
}

const NOTHING: InstallSnapshot = {
  canPrompt: false,
  standalone: false,
  justInstalled: false,
  manual: null,
};

/**
 * One install state for the whole page. Every button reads it, so they all
 * change together: once one opens the browser's install dialog, the others
 * stop offering it (the browser's event can only be used once).
 */
let deferred: BeforeInstallPromptEvent | null = null;
let installedNow = false;
let snapshot: InstallSnapshot = NOTHING;
let listening = false;
const listeners = new Set<() => void>();

function compute(): InstallSnapshot {
  const standalone = isStandalone();
  const settled = standalone || installedNow;
  return {
    canPrompt: Boolean(deferred) && !settled,
    standalone,
    justInstalled: installedNow,
    manual: settled ? null : isIos() ? "ios" : isMacSafari() ? "mac-safari" : null,
  };
}

function publish() {
  const next = compute();
  if (
    next.canPrompt === snapshot.canPrompt &&
    next.standalone === snapshot.standalone &&
    next.justInstalled === snapshot.justInstalled &&
    next.manual === snapshot.manual
  ) {
    return;
  }
  snapshot = next;
  listeners.forEach((listener) => listener());
}

/** The event can only be used once, so the copy stashed before React loaded goes too. */
function forgetEvent() {
  deferred = null;
  delete (window as unknown as { __chronicleInstallEvent?: unknown }).__chronicleInstallEvent;
}

function listen() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  // `beforeinstallprompt` often fires before React has loaded, so an inline
  // script in app/layout.tsx keeps the earliest one on `window`.
  const stashed = (window as unknown as { __chronicleInstallEvent?: BeforeInstallPromptEvent })
    .__chronicleInstallEvent;
  if (stashed) deferred = stashed;
  window.addEventListener("beforeinstallprompt", (e) => {
    // Our own buttons offer it, so the browser's mini-infobar stays away.
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    publish();
  });
  window.addEventListener("appinstalled", () => {
    forgetEvent();
    installedNow = true;
    publish();
  });
  for (const query of [
    "(display-mode: standalone)",
    "(display-mode: minimal-ui)",
    "(display-mode: window-controls-overlay)",
  ]) {
    window.matchMedia(query).addEventListener?.("change", publish);
  }
  snapshot = compute();
}

function subscribe(listener: () => void) {
  listen();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function readSnapshot(): InstallSnapshot {
  listen();
  return snapshot;
}

/** The server never knows; the first render in the browser corrects it. */
const serverSnapshot = (): InstallSnapshot => NOTHING;

/** What the browser allows right now. Offers nothing until the page has loaded. */
export function useInstallState(): InstallSnapshot {
  return useSyncExternalStore(subscribe, readSnapshot, serverSnapshot);
}

/**
 * Opens the browser's install dialog. Must be called from a click or a tap.
 * Resolves to true when the person installed the app.
 */
export async function promptInstall(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  try {
    await event.prompt();
    const { outcome } = await event.userChoice;
    forgetEvent();
    if (outcome === "accepted") installedNow = true;
    publish();
    return outcome === "accepted";
  } catch {
    forgetEvent();
    publish();
    return false;
  }
}

export type InstallState = InstallSnapshot & {
  /** The browser offered a native install prompt. */
  canInstall: boolean;
  /** Running as the app, or installed during this visit. */
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

/** The install state, plus the fortnight-long "not now" of the app's banner. */
export function useInstall(): InstallState {
  const state = useInstallState();
  const [dismissed, setDismissed] = useState(true); // assume dismissed until read

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      const at = raw ? Number(raw) : 0;
      setDismissed(Boolean(at) && Date.now() - at < DISMISS_DAYS * 86_400_000);
    } catch {
      setDismissed(false);
    }
  }, []);

  const dismissBanner = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* storage unavailable — the banner simply returns next session */
    }
  }, []);

  const installed = state.standalone || state.justInstalled;
  return {
    ...state,
    canInstall: state.canPrompt,
    installed,
    needsIosInstructions: state.manual === "ios",
    promptInstall,
    bannerVisible: !installed && !dismissed && (state.canPrompt || state.manual === "ios"),
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

    void registerServiceWorker().then((r) => {
      if (!r || cancelled) return;
      reg = r;
      track(r);
      // Look for a fresh build on load and hourly thereafter.
      r.update().catch(() => {});
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
