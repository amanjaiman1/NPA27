"use client";

/* ════════════════════════════════════════════════════════════════
   THE ADMIN CENTER'S BROWSER SIDE
   Calls /api/admin/* (and the student routes) with the signed-in
   session's access token. Nothing here decides what anyone may do: the
   API and the database do. This only carries the answer back.
   ════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

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

export interface Loaded<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  reload: () => void;
  /** Replace the data after a change the server answered with. */
  set: (data: T) => void;
}

/** Loads `path` from the Admin API, and again whenever it changes or `reload` is called. */
export function useAdmin<T>(path: string | null): Loaded<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [tick, setTick] = useState(0);
  const latest = useRef(0);

  useEffect(() => {
    if (!path) return;
    const id = ++latest.current;
    setLoading(true);
    adminApi
      .get<T>(path)
      .then((d) => {
        if (id !== latest.current) return;
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => {
        if (id !== latest.current) return;
        setError(e instanceof ApiError ? e : new ApiError(500, "error", "Something went wrong."));
      })
      .finally(() => {
        if (id === latest.current) setLoading(false);
      });
  }, [path, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload, set: setData };
}
