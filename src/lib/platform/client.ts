"use client";

/* ════════════════════════════════════════════════════════════════
   THE ADMIN CENTER'S BROWSER SIDE
   Calls /api/admin/* (and the student routes) with the signed-in
   session's access token. Nothing here decides what anyone may do: the
   API and the database do. This only carries the answer back.

   Every view that loads Admin Center data takes part in Refresh Data
   (lib/platform/admin-refresh.ts): `useAdmin` does it by itself, and
   `useAdminView` lets anything else join.
   ════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase";
import { DemoBlockedError, isDemo } from "@/lib/demo/mode";
import { useAdminUpdates } from "@/components/platform/live-updates";
import { adminAreasFor, type LiveArea } from "./live";
import {
  RefreshTimeout,
  adminResourceOf,
  createResponseOrder,
  getAdminRefreshServerSnapshot,
  getAdminRefreshSnapshot,
  noteAdminLoad,
  noteAdminLoadFailed,
  registerAdminView,
  subscribeAdminRefresh,
  type AdminFetch,
  type AdminRefreshSnapshot,
  type AdminResourceId,
  type RefreshContext,
  type ViewReport,
} from "./admin-refresh";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function token(): Promise<string | null> {
  return (await supabase?.auth.getSession())?.data.session?.access_token ?? null;
}

interface CallInit {
  method?: string;
  body?: unknown;
  /** Reads only: give up when this aborts (an "aborted" ApiError). */
  signal?: AbortSignal;
  /** Reads only: give up after this long (a "timeout" ApiError). */
  timeoutMs?: number;
}

/** A JSON call with the session's token. Resolves to `data`; throws ApiError otherwise. */
export async function apiCall<T = unknown>(path: string, init: CallInit = {}): Promise<T> {
  // The demo never speaks for anyone, even when someone is signed in in this browser.
  if (isDemo()) throw new ApiError(403, "demo", new DemoBlockedError().message);
  const t = await token();
  if (!t) throw new ApiError(401, "unauthorized", "Sign in to continue.");
  // A read can be given up: a newer one replaced it, or it took too long. A change never is,
  // so none is left half-done as far as this page knows.
  const reading = (init.method ?? "GET") === "GET";
  const controller = reading && (init.signal || init.timeoutMs) ? new AbortController() : null;
  let timedOut = false;
  const onAbort = () => controller?.abort();
  if (controller && init.signal) {
    if (init.signal.aborted) controller.abort();
    else init.signal.addEventListener("abort", onAbort, { once: true });
  }
  const timer =
    controller && init.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, init.timeoutMs)
      : undefined;
  const stopped = () =>
    timedOut
      ? new ApiError(0, "timeout", "The server took too long to answer. Try again.")
      : controller?.signal.aborted
        ? new ApiError(0, "aborted", "Cancelled.")
        : null;
  try {
    let res: Response;
    try {
      res = await fetch(path, {
        method: init.method ?? "GET",
        headers: { Authorization: `Bearer ${t}`, ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}) },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        cache: "no-store",
        credentials: "same-origin",
        signal: controller?.signal,
      });
    } catch {
      throw stopped() ?? new ApiError(0, "offline", "Couldn't reach the server. Check your connection.");
    }
    const body = (await res.json().catch(() => null)) as { data?: T; error?: string; code?: string } | null;
    const gaveUp = stopped();
    if (gaveUp) throw gaveUp;
    if (!res.ok) throw new ApiError(res.status, body?.code ?? "error", body?.error ?? "Something went wrong.");
    return body?.data as T;
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener("abort", onAbort);
  }
}

export const adminApi = {
  get: <T>(path: string, options: { signal?: AbortSignal; timeoutMs?: number } = {}) => apiCall<T>(`/api/admin/${path}`, options),
  post: <T>(path: string, body: unknown = {}) => apiCall<T>(`/api/admin/${path}`, { method: "POST", body }),
  patch: <T>(path: string, body: unknown) => apiCall<T>(`/api/admin/${path}`, { method: "PATCH", body }),
  put: <T>(path: string, body: unknown) => apiCall<T>(`/api/admin/${path}`, { method: "PUT", body }),
  del: <T>(path: string, body: unknown = {}) => apiCall<T>(`/api/admin/${path}`, { method: "DELETE", body }),
};

/** How Refresh Data reaches the Admin API. */
export const adminFetch: AdminFetch = (path, signal) => adminApi.get(path, { signal });

/** The least time between two reloads for visits (live update area "activity"). */
const ACTIVITY_GAP_MS = 4_000;
/** How long a page waits for its data before it says it couldn't load. */
const LOAD_TIMEOUT_MS = 20_000;

/** Any failure, as an ApiError (Refresh Data's own timeout included). */
export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (e instanceof RefreshTimeout) return new ApiError(0, "timeout", e.message);
  return new ApiError(500, "error", "Something went wrong.");
}

export interface Loaded<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  reload: () => void;
  /**
   * Fetches again quietly: no loading state, what's shown stays until the
   * answer arrives, and a failure keeps it. What live updates call.
   */
  refresh: () => void;
  /** Replace the data after a change the server answered with. Anything asked before it can't overwrite it. */
  set: (data: T) => void;
}

export interface AdminOptions<T> {
  /** Which live updates count; by default they follow the path (`adminAreasFor`). `false`: none. */
  live?: readonly LiveArea[] | false;
  /** What else came with an answer (visits, with the user list), for Refresh Data's status panel. */
  report?: (data: T) => ViewReport;
}

/** The status of Refresh Data and of every resource, kept current. */
export function useAdminRefreshState(): AdminRefreshSnapshot {
  return useSyncExternalStore(subscribeAdminRefresh, getAdminRefreshSnapshot, getAdminRefreshServerSnapshot);
}

/**
 * Takes part in Refresh Data while mounted: `refresh` fetches through
 * `ctx.get` and puts the answer on screen, or throws. `useAdmin` does this
 * by itself; this is for views that load their own way (the audit log).
 */
export function useAdminView(
  resource: AdminResourceId | null,
  key: string | null,
  refresh: (ctx: RefreshContext) => Promise<ViewReport | void>,
): void {
  const latest = useRef(refresh);
  latest.current = refresh;
  useEffect(() => {
    if (!resource || !key) return;
    return registerAdminView({ resource, key, refresh: (ctx) => latest.current(ctx) });
  }, [resource, key]);
}

/**
 * Two answers that show the same thing. Signed screenshot links are new on
 * every answer and say nothing new, so they're left out of the comparison.
 */
function sameData(a: unknown, b: unknown): boolean {
  const stable = (v: unknown) => JSON.stringify(v, (k, x) => (k === "screenshotUrl" ? undefined : x));
  return stable(a) === stable(b);
}

/**
 * Loads `path` from the Admin API, again whenever it changes or `reload` is
 * called, and quietly whenever something it shows changes anywhere: a
 * student sends a review, another administrator acts, a new account signs
 * up (live updates, lib/platform/live.ts). `live` overrides which changes
 * count; by default they follow the path (`adminAreasFor`).
 *
 * It takes part in Refresh Data while mounted. Whatever asks (opening,
 * a live update, Refresh Data), an answer goes on screen only if no newer
 * request's answer already has, so a slow old request never overwrites a
 * newer one, and nothing asked for an earlier address (another filter or
 * page) ever shows. What's on screen stays while anything quiet loads:
 * filters, pages, open dialogs and anything being typed are the page's own.
 */
export function useAdmin<T>(path: string | null, options: AdminOptions<T> = {}): Loaded<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [tick, setTick] = useState(0);
  const [order] = useState(createResponseOrder);
  const pathRef = useRef(path);
  pathRef.current = path;
  /** The address whose answer is on screen: the rows of the last filter don't count for the next. */
  const shownFor = useRef<string | null>(null);
  const onScreen = useCallback(() => shownFor.current !== null && shownFor.current === pathRef.current, []);
  const report = useRef(options.report);
  report.current = options.report;
  /** This view's own request under way, so a newer one can let it go. */
  const own = useRef<AbortController | null>(null);

  /** Puts `p`'s answer on screen unless a newer one is there. */
  const show = useCallback(
    (n: number, p: string, d: T): boolean => {
      if (!order.take(n)) return false;
      shownFor.current = p;
      // The same answer as before keeps the same object, so nothing re-renders for it.
      setData((prev) => (prev !== null && sameData(prev, d) ? prev : d));
      setError(null);
      return true;
    },
    [order],
  );

  const fetchNow = useCallback(
    (kind: "opened" | "reloaded" | "live") => {
      const p = pathRef.current;
      if (!p) return;
      const quiet = kind === "live";
      own.current?.abort();
      const controller = new AbortController();
      own.current = controller;
      const n = order.begin();
      const resource = adminResourceOf(p);
      if (!quiet) setLoading(true);
      adminApi
        .get<T>(p, { signal: controller.signal, timeoutMs: LOAD_TIMEOUT_MS })
        .then((d) => {
          if (show(n, p, d) && resource) noteAdminLoad(resource, kind, report.current?.(d));
        })
        .catch((e: unknown) => {
          const err = toApiError(e);
          if (err.code === "aborted" || !order.isLatest(n)) return;
          // A quiet refresh that fails keeps what's on screen, unless what's on screen is gone;
          // with nothing of this address on screen yet, say why.
          const nothingShown = !onScreen();
          if (quiet && !nothingShown && err.status !== 404) return;
          setError(err);
          if (resource && (!quiet || nothingShown)) noteAdminLoadFailed(resource, err);
        })
        .finally(() => {
          if (order.isLatest(n)) setLoading(false);
          if (own.current === controller) own.current = null;
        });
    },
    [order, show, onScreen],
  );

  const lastPath = useRef<string | null>(null);
  useEffect(() => {
    if (!path) {
      // Closed (a dialog): what it asked for is no longer wanted.
      own.current?.abort();
      return;
    }
    const moved = lastPath.current !== path;
    // Another address: nothing asked for the last one may show.
    if (moved && lastPath.current !== null) order.reset();
    lastPath.current = path;
    fetchNow(moved ? "opened" : "reloaded");
  }, [path, tick, fetchNow, order]);
  useEffect(() => () => own.current?.abort(), []);

  /** Refresh Data: the same request for every view of this address, and its answer here. */
  const refreshFromRun = useCallback(
    async (ctx: RefreshContext): Promise<ViewReport | void> => {
      const p = pathRef.current;
      if (!p) return;
      const n = order.begin();
      try {
        const d = await ctx.get<T>(p);
        // Moved on meanwhile (another filter, page or record): its own load shows that one.
        if (pathRef.current !== p) return;
        show(n, p, d);
        return report.current?.(d);
      } catch (e) {
        if (pathRef.current !== p) return;
        // A newer answer is on screen already (a live update that started after this request):
        // this view is up to date, whatever became of the refresh's own request.
        if (order.superseded(n)) return;
        const err = toApiError(e);
        if (err.status === 404) {
          // What was open is gone: it says so where it was shown, and that is up to date.
          setError(err);
          return { gone: true };
        }
        // Nothing of this address on screen to keep: say why, as a first load would.
        if (!onScreen() && order.isLatest(n)) setError(err);
        throw e;
      } finally {
        if (order.isLatest(n)) setLoading(false);
      }
    },
    [order, show, onScreen],
  );
  useAdminView(path ? adminResourceOf(path) : null, path, refreshFromRun);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const refresh = useCallback(() => fetchNow("live"), [fetchNow]);
  // The server's answer to a change made here: newer than anything asked before it. Bound to the
  // address it was made for, so an answer that arrives after the view moved on (a dialog closed
  // and another record opened) is dropped instead of standing in for the new one.
  const set = useCallback(
    (d: T) => {
      if (!path || pathRef.current !== path) return;
      order.take(order.begin());
      shownFor.current = path;
      setData(d);
      setError(null);
      setLoading(false);
    },
    [order, path],
  );
  const areas = options.live === false ? [] : (options.live ?? (path ? adminAreasFor(path) : []));
  const changes = areas.filter((a) => a !== "activity");
  useAdminUpdates(changes, refresh, Boolean(path) && changes.length > 0);
  // Visits starting and ending: as many as there are people coming and
  // going, so one reload for every few seconds of them at most.
  useAdminUpdates(["activity"], refresh, Boolean(path) && areas.includes("activity"), ACTIVITY_GAP_MS);
  return { data, error, loading, reload, refresh, set };
}

/**
 * Refreshes when the earliest of `times` (ISO timestamps) arrives: a
 * scheduled announcement starting or ending, an update due to be published.
 * Nothing in the database changes at that moment, so no live update says so.
 */
export function useRefreshAt(times: readonly (string | null | undefined)[], refresh: () => void): void {
  const latest = useRef(refresh);
  latest.current = refresh;
  const key = times.filter(Boolean).join("|");

  useEffect(() => {
    const now = Date.now();
    const next = key
      .split("|")
      .map((t) => Date.parse(t))
      .filter((t) => Number.isFinite(t) && t > now)
      .sort((a, b) => a - b)[0];
    // A little after, so the server agrees it has happened. Further off than a day, opening the page catches it.
    if (next === undefined || next - now > 86_400_000) return;
    const timer = setTimeout(() => latest.current(), next - now + 3_000);
    return () => clearTimeout(timer);
  }, [key]);
}
