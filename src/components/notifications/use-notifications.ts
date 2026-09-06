"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChronicle, useHasHydrated } from "@/lib/store";
import { toISODate } from "@/lib/utils";
import {
  evaluate,
  buildInbox,
  staleStateIds,
  withDefaults,
  type Inbox,
  type NotifySettings,
} from "@/lib/notifications";
import type { ChronicleData } from "@/lib/types";

const EMPTY_INBOX: Inbox = {
  items: [],
  groups: [],
  unread: 0,
  deliverable: [],
};

/**
 * How often the clock is re-read. Several rules are hour-gated ("you haven't
 * logged today", habits after your reminder hour), so the inbox has to notice
 * time passing without a reload — but a minute is far finer than any rule needs,
 * and re-evaluating is cheap and pure.
 */
const TICK_MS = 60_000;

/**
 * Binds the pure rules engine to the store.
 *
 * Every slice is selected individually rather than through one object-returning
 * selector: zustand compares selector output by reference, so an object literal
 * would allocate a new one on every store change and re-render this hook
 * constantly. Individual array references are stable until that array actually
 * changes.
 */
export function useNotifications() {
  const hydrated = useHasHydrated();

  const profile = useChronicle((s) => s.profile);
  const subjects = useChronicle((s) => s.subjects);
  const journal = useChronicle((s) => s.journal);
  const mocks = useChronicle((s) => s.mocks);
  const revisions = useChronicle((s) => s.revisions);
  const currentAffairs = useChronicle((s) => s.currentAffairs);
  const mistakes = useChronicle((s) => s.mistakes);
  const habits = useChronicle((s) => s.habits);
  const sleep = useChronicle((s) => s.sleep);
  const lifeLog = useChronicle((s) => s.lifeLog);
  const goals = useChronicle((s) => s.goals);
  const books = useChronicle((s) => s.books);
  const reflections = useChronicle((s) => s.reflections);
  const reviews = useChronicle((s) => s.reviews);

  const notify = useChronicle((s) => s.notify);
  const notifyState = useChronicle((s) => s.notifyState);
  const notifyLog = useChronicle((s) => s.notifyLog);
  const pruneNotifyState = useChronicle((s) => s.pruneNotifyState);

  const settings: NotifySettings = useMemo(() => withDefaults(notify), [notify]);

  /* ── the clock ───────────────────────────────────────────────
     Kept in state so a tick re-renders. Coming back to a backgrounded tab also
     forces a re-read: an interval in a throttled tab can be minutes late, and
     the first thing you do on returning is look at the bell. */
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const bump = () => setNowMs(Date.now());
    const id = window.setInterval(bump, TICK_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") bump();
    };
    window.addEventListener("focus", bump);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", bump);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  /**
   * Rounded down to the minute so that an unrelated re-render doesn't produce a
   * fractionally different `now` and invalidate the memo below.
   */
  const now = useMemo(() => new Date(Math.floor(nowMs / 60_000) * 60_000), [nowMs]);
  const today = useMemo(() => toISODate(now), [now]);

  /**
   * The slices no rule reads are passed as empty rather than subscribed to, so
   * pinning a milestone or drawing a graph edge doesn't re-evaluate every rule.
   * A new rule that needs one of these must add the matching selector above —
   * otherwise it would quietly see nothing. The engine takes a full
   * `ChronicleData` so it stays reusable server-side, where all of it is present.
   */
  const data: ChronicleData | null = useMemo(() => {
    if (!hydrated) return null;
    return {
      profile,
      accomplished: [],
      subjects,
      journal,
      mocks,
      revisions,
      currentAffairs,
      mistakes,
      habits,
      sleep,
      exercise: [],
      lifeLog,
      goals,
      books,
      milestones: [],
      reflections,
      reviews,
      topicLinks: [],
      selection: [],
    };
  }, [
    hydrated,
    profile,
    subjects,
    journal,
    mocks,
    revisions,
    currentAffairs,
    mistakes,
    habits,
    sleep,
    lifeLog,
    goals,
    books,
    reflections,
    reviews,
  ]);

  /**
   * Never evaluated before hydration: the store starts from fresh defaults, so
   * evaluating early would flash a bell full of notices about data that is about
   * to be replaced by what's actually on disk.
   */
  const notices = useMemo(
    () => (data ? evaluate(data, { now, settings }) : []),
    [data, now, settings],
  );

  const inbox = useMemo(
    () => (data ? buildInbox(notices, notifyState, today) : EMPTY_INBOX),
    [data, notices, notifyState, today],
  );

  /* ── pruning ─────────────────────────────────────────────────
     Read/dismiss state for a notice that has stopped being true is dead weight
     in a snapshot that syncs to the cloud. It is swept once per day rather than
     on every recomputation, because several rules only hold during part of the
     day — sweeping continuously would discard "I've seen this" for a notice
     that is merely between its hours, and it would come back unread. */
  const sweptOn = useRef<string | null>(null);
  useEffect(() => {
    if (!data || sweptOn.current === today) return;
    sweptOn.current = today;
    pruneNotifyState(staleStateIds(notices, notifyState));
    // `notices`/`notifyState` are read at sweep time, not tracked: re-running on
    // every change is exactly what this guard exists to prevent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, today, pruneNotifyState]);

  return { inbox, settings, notifyLog, now, today, hydrated };
}

/**
 * Notification permission, as a value React can render.
 *
 * `denied` is terminal — the spec forbids re-prompting from script — so the UI
 * has to say so rather than offer a button that silently does nothing.
 */
export type PermissionState =
  | "unsupported"
  | "default"
  | "granted"
  | "denied";

export function useNotificationPermission() {
  const [permission, setPermission] = useState<PermissionState>("default");

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission as PermissionState);
  }, []);

  /** Must be called from a real user gesture, or browsers reject it outright. */
  const request = useCallback(async (): Promise<PermissionState> => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPermission("unsupported");
      return "unsupported";
    }
    try {
      const result = (await Notification.requestPermission()) as PermissionState;
      setPermission(result);
      return result;
    } catch {
      /* Older Safari only supports the callback form; treat a throw as no change. */
      const current = Notification.permission as PermissionState;
      setPermission(current);
      return current;
    }
  }, []);

  return { permission, request };
}
