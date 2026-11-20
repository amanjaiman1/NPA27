"use client";

/* ════════════════════════════════════════════════════════════════
   THE ADMIN CENTER'S BROWSER SIDE
   Calls /api/admin/* (and the student routes) with the signed-in
   session's access token. Nothing here decides what anyone may do: the
   API and the database do. This only carries the answer back.
   ════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { DemoBlockedError, isDemo } from "@/lib/demo/mode";
import { useAdminUpdates } from "@/components/platform/live-updates";
import { adminAreasFor, type LiveArea } from "./live";

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

/** A JSON call with the session's token. Resolves to `data`; throws ApiError otherwise. */
export async function apiCall<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  // The demo never speaks for anyone, even when someone is signed in in this browser.
  if (isDemo()) throw new ApiError(403, "demo", new DemoBlockedError().message);
  const t = await token();
  if (!t) throw new ApiError(401, "unauthorized", "Sign in to continue.");
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? "GET",
      headers: { Authorization: `Bearer ${t}`, ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError(0, "offline", "Couldn't reach the server. Check your connection.");
  }
  const body = (await res.json().catch(() => null)) as { data?: T; error?: string; code?: string } | null;
  if (!res.ok) throw new ApiError(res.status, body?.code ?? "error", body?.error ?? "Something went wrong.");
  return body?.data as T;
}

export const adminApi = {
  get: <T>(path: string) => apiCall<T>(`/api/admin/${path}`),
  post: <T>(path: string, body: unknown = {}) => apiCall<T>(`/api/admin/${path}`, { method: "POST", body }),
  patch: <T>(path: string, body: unknown) => apiCall<T>(`/api/admin/${path}`, { method: "PATCH", body }),
  put: <T>(path: string, body: unknown) => apiCall<T>(`/api/admin/${path}`, { method: "PUT", body }),
  del: <T>(path: string, body: unknown = {}) => apiCall<T>(`/api/admin/${path}`, { method: "DELETE", body }),
};

/** The least time between two reloads for visits (live update area "activity"). */
const ACTIVITY_GAP_MS = 4_000;

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
  /** Replace the data after a change the server answered with. */
  set: (data: T) => void;
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
 */
export function useAdmin<T>(path: string | null, options: { live?: readonly LiveArea[] | false } = {}): Loaded<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [tick, setTick] = useState(0);
  const latest = useRef(0);
  const pathRef = useRef(path);
  pathRef.current = path;
  const shown = useRef(false);
  shown.current = data !== null;

  const fetchNow = useCallback((quiet: boolean) => {
    const p = pathRef.current;
    if (!p) return;
    const id = ++latest.current;
    if (!quiet) setLoading(true);
    adminApi
      .get<T>(p)
      .then((d) => {
        if (id !== latest.current) return;
        // The same answer as before keeps the same object, so nothing re-renders for it.
        setData((prev) => (prev !== null && sameData(prev, d) ? prev : d));
        setError(null);
      })
      .catch((e: unknown) => {
        if (id !== latest.current) return;
        // A quiet refresh that fails keeps what's on screen; with nothing on screen yet, say why.
        if (quiet && shown.current) return;
        setError(e instanceof ApiError ? e : new ApiError(500, "error", "Something went wrong."));
      })
      .finally(() => {
        if (id === latest.current) setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (path) fetchNow(false);
  }, [path, tick, fetchNow]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const refresh = useCallback(() => fetchNow(true), [fetchNow]);
  const areas = options.live === false ? [] : (options.live ?? (path ? adminAreasFor(path) : []));
  const changes = areas.filter((a) => a !== "activity");
  useAdminUpdates(changes, refresh, Boolean(path) && changes.length > 0);
  // Visits starting and ending: as many as there are people coming and
  // going, so one reload for every few seconds of them at most.
  useAdminUpdates(["activity"], refresh, Boolean(path) && areas.includes("activity"), ACTIVITY_GAP_MS);
  return { data, error, loading, reload, refresh, set: setData };
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
