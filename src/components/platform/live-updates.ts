"use client";

/* ════════════════════════════════════════════════════════════════
   LIVE UPDATES, IN THE BROWSER
   One Realtime channel per tab, shared by everything that listens
   (lib/platform/live.ts explains the messages). Each listener names the
   areas it shows; when one of them changes, it reloads its own data.

   Kept small for Supabase's free plan (200 connections at once):
   - connected only while the app is on screen: a tab in the background
     lets go after a minute, and catches up when it comes back;
   - each listener reloads once per burst of changes, at a random moment
     within two seconds, so every open app doesn't ask in the same instant;
   - if the channel can't be joined (the migration hasn't run, Realtime is
     full or switched off), it stops trying for ten minutes. The app then
     works as before: it reloads when it opens and when it comes back.
   ════════════════════════════════════════════════════════════════ */

import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { LIVE_AREAS, LIVE_EVENT, LIVE_TOPIC, liveAreasOf, type LiveArea } from "@/lib/platform/live";
import { isDemo } from "@/lib/demo/mode";

const HIDDEN_LET_GO_MS = 60_000;
const GIVE_UP_AFTER_ERRORS = 3;
const PAUSE_AFTER_GIVING_UP_MS = 10 * 60_000;
/** Reloads after a change are spread over this long. */
const SPREAD_MS = 2_000;
/** And come at least this far apart, per listener. */
const MIN_GAP_MS = 3_000;

interface Listener {
  areas: ReadonlySet<LiveArea>;
  fn: () => void;
}

const listeners = new Set<Listener>();
let channel: RealtimeChannel | null = null;
/** True when messages may have been missed: the next join tells every listener to reload. */
let missed = false;
let errors = 0;
let pausedUntil = 0;
let letGoTimer: ReturnType<typeof setTimeout> | null = null;
let watching = false;

function emit(areas: readonly LiveArea[]) {
  if (!areas.length) return;
  for (const l of [...listeners]) if (areas.some((a) => l.areas.has(a))) l.fn();
}

async function connect() {
  const client = supabase;
  // The demo joins nothing with the session of whoever is signed in here (lib/demo/mode.ts).
  if (!client || channel || !listeners.size || Date.now() < pausedUntil || isDemo()) return;
  const ch = client.channel(LIVE_TOPIC, { config: { private: true } });
  channel = ch;
  ch.on("broadcast", { event: LIVE_EVENT }, (message) => emit(liveAreasOf(message.payload)));
  // A private channel is joined with the session's own token.
  await client.realtime.setAuth().catch(() => undefined);
  if (channel !== ch) return; // let go of meanwhile
  ch.subscribe((status) => {
    if (channel !== ch) return;
    if (status === "SUBSCRIBED") {
      errors = 0;
      if (missed) {
        missed = false;
        emit(LIVE_AREAS);
      }
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      missed = true;
      if (++errors >= GIVE_UP_AFTER_ERRORS) {
        pausedUntil = Date.now() + PAUSE_AFTER_GIVING_UP_MS;
        errors = 0;
        disconnect();
      }
    } else if (status === "CLOSED") {
      missed = true;
    }
  });
}

function disconnect() {
  const ch = channel;
  channel = null;
  if (!ch || !supabase) return;
  missed = true;
  const client = supabase;
  void client
    .removeChannel(ch)
    .catch(() => undefined)
    // Nothing else in the app uses Realtime: with no channel left, close the connection too.
    .finally(() => {
      if (!channel && client.getChannels().length === 0) client.realtime.disconnect();
    });
}

function onVisibility() {
  if (document.visibilityState === "visible") {
    if (letGoTimer) clearTimeout(letGoTimer);
    letGoTimer = null;
    void connect();
  } else if (!letGoTimer) {
    letGoTimer = setTimeout(() => {
      letGoTimer = null;
      disconnect();
    }, HIDDEN_LET_GO_MS);
  }
}

/** Calls `fn` whenever one of `areas` changes. Returns the way to stop. */
export function subscribePlatformUpdates(areas: readonly LiveArea[], fn: () => void): () => void {
  const listener: Listener = { areas: new Set(areas), fn };
  listeners.add(listener);
  if (!watching) {
    watching = true;
    document.addEventListener("visibilitychange", onVisibility);
  }
  onVisibility();
  return () => {
    listeners.delete(listener);
    if (listeners.size) return;
    document.removeEventListener("visibilitychange", onVisibility);
    watching = false;
    if (letGoTimer) clearTimeout(letGoTimer);
    letGoTimer = null;
    disconnect();
    // A fresh start for the next account: nothing to catch up on.
    missed = false;
    errors = 0;
  };
}

/**
 * Reloads with `reload` whenever the team changes one of `areas`, while
 * `enabled` (an account is signed in and the feature is set up). The newest
 * `reload` is always the one called.
 */
export function usePlatformUpdates(areas: readonly LiveArea[], reload: () => void, enabled = true): void {
  const latest = useRef(reload);
  latest.current = reload;
  const key = [...areas].sort().join(",");

  useEffect(() => {
    if (!enabled || !supabase || !key) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let last = 0;
    const off = subscribePlatformUpdates(key.split(",") as LiveArea[], () => {
      if (timer) return; // one reload per burst
      const wait = Math.max(Math.random() * SPREAD_MS, MIN_GAP_MS - (Date.now() - last));
      timer = setTimeout(() => {
        timer = null;
        last = Date.now();
        latest.current();
      }, wait);
    });
    return () => {
      off();
      if (timer) clearTimeout(timer);
    };
  }, [key, enabled]);
}
