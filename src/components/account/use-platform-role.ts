"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { isPlatformRole, type PlatformRole } from "@/lib/platform/roles";

const TTL = 5 * 60_000;
const storageKey = (userId: string) => `doordie:admin-role:${userId}`;
const inflight = new Map<string, Promise<PlatformRole | null>>();

function cached(userId: string): { role: PlatformRole | null } | null {
  try {
    const c = JSON.parse(sessionStorage.getItem(storageKey(userId)) ?? "null") as { role?: unknown; at?: number } | null;
    if (!c || typeof c.at !== "number" || Date.now() - c.at > TTL) return null;
    return { role: isPlatformRole(c.role) ? c.role : null };
  } catch {
    return null;
  }
}

function ask(userId: string): Promise<PlatformRole | null> {
  const pending = inflight.get(userId);
  if (pending) return pending;
  const p = (async () => {
    const { data, error } = (await supabase?.rpc("platform_my_role")) ?? { data: null, error: null };
    // A failure isn't remembered, so the next page asks again.
    if (error) return null;
    const role = data && isPlatformRole((data as { role?: unknown }).role) ? (data as { role: PlatformRole }).role : null;
    try {
      sessionStorage.setItem(storageKey(userId), JSON.stringify({ role, at: Date.now() }));
    } catch {
      /* private mode: ask again next time */
    }
    return role;
  })().finally(() => inflight.delete(userId));
  inflight.set(userId, p);
  return p;
}

/**
 * The signed-in account's Admin Center role, to decide whether to show a
 * link to it. The database answers for the session's own account (the
 * `platform_my_role` function), at most once every few minutes per tab.
 * Showing the link grants nothing: the Admin Center checks again on the
 * server for every page and every request.
 */
export function usePlatformRole(userId: string | null | undefined): PlatformRole | null {
  const [role, setRole] = useState<PlatformRole | null>(null);
  useEffect(() => {
    if (!userId || !supabase) {
      setRole(null);
      return;
    }
    const hit = cached(userId);
    if (hit) {
      setRole(hit.role);
      return;
    }
    let live = true;
    void ask(userId).then((r) => live && setRole(r));
    return () => {
      live = false;
    };
  }, [userId]);
  return role;
}
