"use client";

import {
  createContext,
  createElement,
  startTransition,
  useCallback,
  useContext,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { useChronicle, useHasHydrated } from "@/lib/store";
import { useAccount, useSyncStatus } from "@/components/account/account-session";
import { toISODate } from "@/lib/utils";
import {
  evaluate,
  buildInbox,
  staleStateIds,
  withDefaults,
  type DeliveryLog,
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

export interface NotificationsValue {
  inbox: Inbox;
  settings: NotifySettings;
  notifyLog: DeliveryLog;
  /** The current minute. Changes once a minute, and on returning to the tab. */
  now: Date;
  today: string;
  /** The account's data has been read from this device. */
  hydrated: boolean;
  /**
   * The inbox describes the records as they are now. Briefly false while the
   * page first paints and right after an edit, when evaluation runs deferred.
   */
  evaluated: boolean;
  /**
   * Hydrated, and the first cloud sync of this visit has finished or cannot
   * happen. Interrupting someone, and tidying their read-state, both wait for
   * this: until then the data on screen may be days behind another device.
   */
  ready: boolean;
}

const NotificationsContext = createContext<NotificationsValue | null>(null);

/**
 * Binds the pure rules engine to the store. Runs once, in the provider, and
 * every reader — the bell, the panel, the notifier — shares the result. Each of
 * them used to run its own copy, with its own clock and listeners, so every
 * change in the data was evaluated two or three times over.
 *
 * Every slice is selected individually rather than through one object-returning
 * selector: zustand compares selector output by reference, so an object literal
 * would allocate a new one on every store change and re-render constantly.
 * Individual array references are stable until that array actually changes.
 */
function useNotificationsSource(): NotificationsValue {
  const hydrated = useHasHydrated();
  const { mode } = useAccount();
  const { sync } = useSyncStatus();

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

  /**
   * Settled once a sync has completed this visit, or once it is clear none can
   * (offline, an error, a local-only or demo account). Read-state and settings acknowledged
   * on another device arrive with that first sync.
   */
  const synced =
    mode !== "cloud" ||
    sync.lastSyncedAt !== null ||
    sync.status === "offline" ||
    sync.status === "error";
  const ready = hydrated && synced;

  /* ── the clock ───────────────────────────────────────────────
     Kept in state so a tick re-renders. Coming back to a backgrounded tab also
     forces a re-read: an interval in a throttled tab can be minutes late, and
     the first thing you do on returning is look at the bell. */
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    // A transition: re-reading every rule once a minute must never hold up a tap.
    const bump = () => startTransition(() => setNowMs(Date.now()));
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
   * Rounded down to the minute so that a bump inside the same minute doesn't
   * produce a fractionally different `now` and invalidate everything below.
   */
  const minute = Math.floor(nowMs / 60_000) * 60_000;
  const now = useMemo(() => new Date(minute), [minute]);
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
      files: [],
      plans: [],
      coach: { decisions: [], briefings: [] },
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
   *
   * Never in the way of the student, either. Every rule reads the records, so
   * on a long history an evaluation is a noticeable piece of work. It waits
   * for the page's first paint (`settled`), and after an edit it runs on the
   * deferred value: the tap that changed the records paints first, and the
   * bell catches up a moment later in a render React can interrupt.
   */
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (hydrated && !settled) startTransition(() => setSettled(true));
  }, [hydrated, settled]);
  const deferredData = useDeferredValue(settled ? data : null);
  const notices = useMemo(
    () => (deferredData ? evaluate(deferredData, { now, settings }) : []),
    [deferredData, now, settings],
  );

  const inbox = useMemo(
    () => (deferredData ? buildInbox(notices, notifyState, today) : EMPTY_INBOX),
    [deferredData, notices, notifyState, today],
  );

  /* ── pruning ─────────────────────────────────────────────────
     Read/dismiss state for a notice that has stopped being true is dead weight
     in a snapshot that syncs to the cloud. It is swept once per day rather than
     on every recomputation, because several rules only hold during part of the
     day — sweeping continuously would discard "I've seen this" for a notice
     that is merely between its hours, and it would come back unread.

     It waits for the first sync, too. Swept against data that is days behind
     another device, it would throw away "read" for notices that are still true
     there, and they would come back unread everywhere. */
  const sweptOn = useRef<string | null>(null);
  // Only once the notices describe the records as they are: while the
  // deferred evaluation is behind (or hasn't run), every read state would look
  // stale and be thrown away.
  const current = deferredData !== null && deferredData === data;
  useEffect(() => {
    if (!ready || !data || !current || sweptOn.current === today) return;
    sweptOn.current = today;
    pruneNotifyState(staleStateIds(notices, notifyState));
    // `notices`/`notifyState` are read at sweep time, not tracked: re-running on
    // every change is exactly what this guard exists to prevent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, data, current, today, pruneNotifyState]);

  return useMemo(
    () => ({ inbox, settings, notifyLog, now, today, hydrated, evaluated: current, ready }),
    [inbox, settings, notifyLog, now, today, hydrated, current, ready],
  );
}

/**
 * A click on a notification while the app is already open is routed inside the
 * app, as a normal page change. The service worker asks first and only falls
 * back to reloading the window when nothing answers — a page outside the app,
 * say — so a click no longer costs a full reload and the boot screen.
 */
function useNotificationClickRouting() {
  const router = useRouter();
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: unknown; href?: unknown } | null;
      if (!data || data.type !== "chronicle:navigate") return;
      const href = typeof data.href === "string" ? data.href : "";
      // A path inside this site only. `//host` would be another origin.
      if (!href.startsWith("/") || href.startsWith("//")) return;
      router.push(href);
      event.ports[0]?.postMessage("routed");
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    // Messages from the worker are queued until a page says it is listening.
    navigator.serviceWorker.startMessages?.();
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router]);
}

/**
 * Mounted once, in the app shell. The panel renders through a portal, which
 * keeps React context, so it reads from here as well.
 */
export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const value = useNotificationsSource();
  useNotificationClickRouting();
  return createElement(NotificationsContext.Provider, { value }, children);
}

/** The shared inbox, settings and clock. Inside `NotificationsProvider` only. */
export function useNotifications(): NotificationsValue {
  const value = useContext(NotificationsContext);
  if (!value) throw new Error("useNotifications must be used within a NotificationsProvider");
  return value;
}

/* ── permission ──────────────────────────────────────────────── */

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

function readPermission(): PermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission as PermissionState;
}

/**
 * One value for the whole page. Each caller used to hold its own copy, so
 * allowing notifications in the settings pane left the notifier still believing
 * the answer was "not yet", and nothing was delivered until a reload. Changes
 * made in the browser's own site settings are picked up as well: live through
 * the Permissions API where it reports them, and on returning to the tab
 * everywhere else.
 */
let permission: PermissionState | null = null;
const permissionListeners = new Set<() => void>();
/**
 * Held on to: a status object nobody references can be garbage collected, and
 * its change events with it.
 */
const permissionStatuses: PermissionStatus[] = [];
let watchingPermission = false;

function publishPermission(next: PermissionState) {
  if (next === permission) return;
  permission = next;
  permissionListeners.forEach((listener) => listener());
}

function watchPermission() {
  if (watchingPermission || typeof window === "undefined") return;
  watchingPermission = true;
  const reread = () => publishPermission(readPermission());
  window.addEventListener("focus", reread);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") reread();
  });
  try {
    void navigator.permissions
      ?.query({ name: "notifications" as PermissionName })
      .then((status) => {
        permissionStatuses.push(status);
        status.addEventListener("change", reread);
      })
      .catch(() => {});
  } catch {
    // No Permissions API; focus and visibility cover it.
  }
}

function subscribePermission(listener: () => void) {
  watchPermission();
  permissionListeners.add(listener);
  return () => {
    permissionListeners.delete(listener);
  };
}

function permissionSnapshot(): PermissionState {
  if (permission === null) permission = readPermission();
  return permission;
}

/** The server never knows; the first client render corrects it. */
const serverPermission = (): PermissionState => "default";

export function useNotificationPermission() {
  const current = useSyncExternalStore(subscribePermission, permissionSnapshot, serverPermission);

  /** Must be called from a real user gesture, or browsers reject it outright. */
  const request = useCallback(async (): Promise<PermissionState> => {
    if (readPermission() === "unsupported") {
      publishPermission("unsupported");
      return "unsupported";
    }
    try {
      const result = (await Notification.requestPermission()) as PermissionState;
      publishPermission(result);
      return result;
    } catch {
      /* Older Safari only supports the callback form; treat a throw as no change. */
      const now = readPermission();
      publishPermission(now);
      return now;
    }
  }, []);

  return { permission: current, request };
}
