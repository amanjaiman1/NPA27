"use client";

/* ════════════════════════════════════════════════════════════════
   PRESENCE
   Tells the database when this account is on the site, for "Last
   visit" in Admin → Users: when it opened DoOrDie, the moment it left,
   and whether it's there now. Times only, never what the person did
   (supabase/migrations/20261215120000_presence.sql explains how a visit
   is counted, across several tabs and devices).

   - "here" when the app opens or comes back on screen, and once a
     minute while it stays there, so a visit whose end never arrives
     (the browser killed, the connection gone) still ends within a
     couple of minutes;
   - "left" the moment it goes off screen: the tab hidden or closed, the
     phone locked, another app opened, or the account signed out. Sent
     with `navigator.sendBeacon` to /api/presence, the one request
     browsers finish after a page has gone, with the session's token
     kept from the last report: there's no time to ask for one then.

   Each tab has its own random id and numbers its reports, so the
   database can tell one tab leaving from the person leaving, and a late
   report from a fresh one.

   Mounted once for every signed-in screen, the app and the Admin Center
   alike (app/(product)/layout.tsx), so moving between them is one
   visit. The public pages don't load accounts at all, so opening one
   from the app counts as leaving it. Nothing in the demo, which never
   speaks for whoever is signed in here, or in a build without accounts.
   A report that fails changes nothing in the app.
   ════════════════════════════════════════════════════════════════ */

import { useEffect } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { supabase } from "@/lib/supabase";
import { isDemo } from "@/lib/demo/mode";

/** "Still here", while on screen. The database counts a tab as gone 150 s after its last report. */
const BEAT_MS = 60_000;
/**
 * Coming back right after leaving: "here" waits this long after "left".
 * They're numbered, so the database ignores one overtaken by the other, but
 * the beacon goes through the server and is slower.
 */
const AFTER_LEFT_MS = 1_500;

/** This tab, for as long as the page lives: random, and nothing about the device. */
const TAB =
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
let seq = 0;

/** Reports `userId`'s presence while it's signed in on this screen. */
export function usePresence(userId: string | null | undefined): void {
  useEffect(() => {
    const client = supabase;
    if (!userId || !client) return;
    let token: string | null = null;
    let onScreen = false;
    let leftAt = 0;
    let beat: ReturnType<typeof setInterval> | null = null;
    let soon: ReturnType<typeof setTimeout> | null = null;

    const keepToken = () =>
      client.auth.getSession().then(
        ({ data }) => {
          // Only this account's: a sign-out or a switch mid-flight leaves the last one.
          if (data.session?.user.id === userId) token = data.session.access_token;
        },
        () => undefined,
      );

    const report = (state: "here" | "left") => {
      // The request goes out on .then.
      void client
        .rpc("platform_mark_presence", { p_state: state, p_tab: TAB, p_seq: ++seq })
        .then(undefined, () => undefined);
    };

    const here = () => {
      if (isDemo()) return;
      report("here");
      void keepToken();
    };

    const arrive = () => {
      if (onScreen || document.visibilityState !== "visible") return;
      onScreen = true;
      const wait = AFTER_LEFT_MS - (Date.now() - leftAt);
      if (wait > 0) soon = setTimeout(here, wait);
      else here();
      beat = setInterval(here, BEAT_MS);
    };

    const leave = () => {
      if (!onScreen) return;
      onScreen = false;
      leftAt = Date.now();
      if (beat) clearInterval(beat);
      if (soon) clearTimeout(soon);
      beat = soon = null;
      if (isDemo()) return;
      const body = token ? JSON.stringify({ token, tab: TAB, seq: ++seq }) : null;
      // Outlives the page: the tab may be closing.
      const sent = body !== null && typeof navigator.sendBeacon === "function"
        && navigator.sendBeacon("/api/presence", new Blob([body], { type: "application/json" }));
      if (!sent) report("left");
    };

    const onVisibility = () => (document.visibilityState === "visible" ? arrive() : leave());
    // The reports failed while offline: say so now rather than at the next minute.
    const onOnline = () => {
      if (onScreen) here();
    };
    // Restored from the back-forward cache: a new arrival.
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) arrive();
    };

    void keepToken();
    arrive();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", leave);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("online", onOnline);
      // Signed out, or another account signed in: this one has left.
      leave();
    };
  }, [userId]);
}

/** Reports for whoever is signed in. Rendered once, in app/(product)/layout.tsx. */
export function PresenceReporter(): null {
  const auth = useAuth();
  usePresence(auth.cloudEnabled && auth.status === "signedIn" ? auth.user?.id : null);
  return null;
}
