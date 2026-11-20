"use client";

/* ════════════════════════════════════════════════════════════════
   LIVE UPDATES, IN THE BROWSER
   One Realtime connection per tab, with a channel for each topic that
   something on the page listens to (lib/platform/live.ts explains the
   messages and the three topics). Each listener names the areas it
   shows; when one of them changes, it reloads its own data.

   Kept small for Supabase's free plan (200 connections at once):
   - connected only while the page is on screen: a tab in the background
     lets go after a minute, and catches up when it comes back;
   - a listener reloads once per burst of changes, and a message to every
     open app is answered at a random moment within two seconds, so they
     don't all ask in the same instant;
   - a channel that can't be joined (the migration hasn't run, Realtime is
     full or switched off) is left alone for ten minutes. The page then
     works as it did before: it loads when it opens and when it comes back.
   ════════════════════════════════════════════════════════════════ */

import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  ADMIN_TOPIC,
  LIVE_EVENT,
  PLATFORM_TOPIC,
  accountTopic,
  liveAreasOf,
  liveVersionOf,
  type LiveArea,
  type LivePayload,
} from "@/lib/platform/live";
import { isDemo } from "@/lib/demo/mode";

const HIDDEN_LET_GO_MS = 60_000;
const GIVE_UP_AFTER_ERRORS = 3;
const PAUSE_AFTER_GIVING_UP_MS = 10 * 60_000;

type Handler = (payload: LivePayload) => void;

interface Listener {
  areas: ReadonlySet<LiveArea>;
  fn: Handler;
}

interface Topic {
  name: string;
  listeners: Set<Listener>;
  channel: RealtimeChannel | null;
  /** Messages may have been missed: the next join tells every listener to reload. */
  missed: boolean;
  errors: number;
  pausedUntil: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
}

const topics = new Map<string, Topic>();
let letGoTimer: ReturnType<typeof setTimeout> | null = null;
let watching = false;

const onScreen = () => typeof document === "undefined" || document.visibilityState === "visible";

function emit(t: Topic, payload: LivePayload) {
  if (!payload.areas.length) return;
  for (const l of [...t.listeners]) if (payload.areas.some((a) => l.areas.has(a))) l.fn(payload);
}

/** After a gap: every listener reloads what it shows. */
function catchUp(t: Topic) {
  const areas = new Set<LiveArea>();
  for (const l of t.listeners) for (const a of l.areas) areas.add(a);
  emit(t, { areas: [...areas], catchUp: true });
}

async function connect(t: Topic) {
  const client = supabase;
  // The demo joins nothing with the session of whoever is signed in here (lib/demo/mode.ts).
  if (!client || t.channel || !t.listeners.size || Date.now() < t.pausedUntil || isDemo() || !onScreen()) return;
  const ch = client.channel(t.name, { config: { private: true } });
  t.channel = ch;
  ch.on("broadcast", { event: LIVE_EVENT }, (message) => {
    const version = liveVersionOf(message.payload);
    emit(t, { areas: liveAreasOf(message.payload), ...(version ? { version } : {}) });
  });
  // A private channel is joined with the session's own token.
  await client.realtime.setAuth().catch(() => undefined);
  if (t.channel !== ch) return; // let go of meanwhile
  ch.subscribe((status) => {
    if (t.channel !== ch) return;
    if (status === "SUBSCRIBED") {
      t.errors = 0;
      if (t.missed) {
        t.missed = false;
        catchUp(t);
      }
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      t.missed = true;
      if (++t.errors >= GIVE_UP_AFTER_ERRORS) {
        t.errors = 0;
        t.pausedUntil = Date.now() + PAUSE_AFTER_GIVING_UP_MS;
        disconnect(t);
        if (t.retryTimer) clearTimeout(t.retryTimer);
        t.retryTimer = setTimeout(() => {
          t.retryTimer = null;
          void connect(t);
        }, PAUSE_AFTER_GIVING_UP_MS + 1_000);
      }
    } else if (status === "CLOSED") {
      t.missed = true;
    }
  });
}

function disconnect(t: Topic) {
  const ch = t.channel;
  t.channel = null;
  if (!ch || !supabase) return;
  t.missed = true;
  const client = supabase;
  void client
    .removeChannel(ch)
    .catch(() => undefined)
    // Nothing else in the app uses Realtime: with no channel left, close the
    // connection too, since it counts against the plan's limit while open.
    .finally(() => {
      if (![...topics.values()].some((x) => x.channel) && client.getChannels().length === 0) client.realtime.disconnect();
    });
}

function onVisibility() {
  if (onScreen()) {
    if (letGoTimer) clearTimeout(letGoTimer);
    letGoTimer = null;
    for (const t of topics.values()) void connect(t);
  } else if (!letGoTimer) {
    letGoTimer = setTimeout(() => {
      letGoTimer = null;
      for (const t of topics.values()) disconnect(t);
    }, HIDDEN_LET_GO_MS);
  }
}

/** Calls `fn` with each message on `topic` that names one of `areas`. Returns the way to stop. */
export function subscribeLive(topic: string, areas: readonly LiveArea[], fn: Handler): () => void {
  let t = topics.get(topic);
  if (!t) {
    t = { name: topic, listeners: new Set(), channel: null, missed: false, errors: 0, pausedUntil: 0, retryTimer: null };
    topics.set(topic, t);
  }
  const listener: Listener = { areas: new Set(areas), fn };
  t.listeners.add(listener);
  if (!watching && typeof document !== "undefined") {
    watching = true;
    document.addEventListener("visibilitychange", onVisibility);
  }
  void connect(t);
  return () => {
    const current = topics.get(topic);
    if (!current) return;
    current.listeners.delete(listener);
    if (current.listeners.size) return;
    disconnect(current);
    if (current.retryTimer) clearTimeout(current.retryTimer);
    topics.delete(topic);
    if (topics.size) return;
    document.removeEventListener("visibilitychange", onVisibility);
    watching = false;
    if (letGoTimer) clearTimeout(letGoTimer);
    letGoTimer = null;
  };
}

interface Pace {
  /** Answer at a random moment within this long, so many open apps don't ask at once. */
  spreadMs?: number;
  /** And at most once this often, per listener. */
  minGapMs?: number;
}

/**
 * Calls `reload` whenever one of `areas` changes on `topic`, while `enabled`.
 * A burst of changes is one reload, with the newest message. The newest
 * `reload` is always the one called.
 */
export function useLiveUpdates(
  topic: string | null,
  areas: readonly LiveArea[],
  reload: Handler,
  { enabled = true, spreadMs = 0, minGapMs = 1_000 }: Pace & { enabled?: boolean } = {},
): void {
  const latest = useRef(reload);
  latest.current = reload;
  const key = [...new Set(areas)].sort().join(",");

  useEffect(() => {
    if (!enabled || !supabase || !topic || !key) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let last = 0;
    let newest: LivePayload | null = null;
    const off = subscribeLive(topic, key.split(",") as LiveArea[], (payload) => {
      newest = payload;
      if (timer) return;
      const wait = Math.max(spreadMs > 0 ? Math.random() * spreadMs : 0, minGapMs - (Date.now() - last));
      timer = setTimeout(() => {
        timer = null;
        last = Date.now();
        const p = newest ?? { areas: [] };
        newest = null;
        latest.current(p);
      }, wait);
    });
    return () => {
      off();
      if (timer) clearTimeout(timer);
    };
  }, [topic, key, enabled, spreadMs, minGapMs]);
}

/** Changes every signed-in account sees: announcements, the notice, review settings, the changelog. */
export function usePlatformUpdates(areas: readonly LiveArea[], reload: () => void, enabled = true): void {
  useLiveUpdates(PLATFORM_TOPIC, areas, () => reload(), { enabled, spreadMs: 2_000, minGapMs: 3_000 });
}

/** Changes to one account's own things: its feedback and review, read state, role, session. */
export function useAccountUpdates(userId: string | null | undefined, areas: readonly LiveArea[], reload: Handler, enabled = true): void {
  useLiveUpdates(userId ? accountTopic(userId) : null, areas, reload, { enabled, minGapMs: 800 });
}

/** Changes the Admin Center shows. Only Admin Center roles can join this channel. */
export function useAdminUpdates(areas: readonly LiveArea[], reload: () => void, enabled = true): void {
  useLiveUpdates(ADMIN_TOPIC, areas, () => reload(), { enabled, spreadMs: 300, minGapMs: 1_200 });
}
