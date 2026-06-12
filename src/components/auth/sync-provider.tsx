"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "./auth-provider";
import { supabase, isCloudConfigured } from "@/lib/supabase";
import { fetchRemote, pushRemote } from "@/lib/cloud";
import { useChronicle, useHasHydrated, readCloudSnapshot } from "@/lib/store";
import type { CloudSnapshot } from "@/lib/store";

export type SyncStatus =
  | "disabled" // cloud not configured — local-only mode
  | "idle"
  | "syncing"
  | "synced"
  | "offline" // a network/server error; we'll retry
  | "error";

interface SyncContextValue {
  status: SyncStatus;
  /** True once the initial pull/seed for the logged-in user has finished. */
  ready: boolean;
  lastSyncedAt: string | null;
  /** Force an immediate push (flush pending debounce). */
  syncNow: () => void;
}

const SyncContext = createContext<SyncContextValue>({
  status: "disabled",
  ready: true,
  lastSyncedAt: null,
  syncNow: () => {},
});

const PUSH_DEBOUNCE_MS = 2500;
const syncedKey = (userId: string) => `upsc-chronicle-cloud-synced:${userId}`;

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const hydrated = useHasHydrated();

  const [status, setStatus] = useState<SyncStatus>(
    isCloudConfigured ? "idle" : "disabled",
  );
  const [ready, setReady] = useState(!isCloudConfigured);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const userIdRef = useRef<string | null>(null);
  const applyingRef = useRef(false); // true while applying a remote snapshot
  const dirtyRef = useRef(false); // local changes pending a push
  const initialDoneRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doPush = useCallback(async () => {
    const userId = userIdRef.current;
    if (!userId || !supabase) return;
    try {
      setStatus("syncing");
      const updatedAt = await pushRemote(userId, readCloudSnapshot());
      localStorage.setItem(syncedKey(userId), updatedAt);
      setLastSyncedAt(updatedAt);
      dirtyRef.current = false;
      setStatus("synced");
    } catch {
      setStatus("offline");
    }
  }, []);

  const schedulePush = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void doPush(), PUSH_DEBOUNCE_MS);
  }, [doPush]);

  const syncNow = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    void doPush();
  }, [doPush]);

  const adoptRemote = useCallback((data: Partial<CloudSnapshot>) => {
    applyingRef.current = true;
    useChronicle.getState().applyCloudSnapshot(data);
    applyingRef.current = false;
  }, []);

  // ── Initial sync: pull on login (after local store hydration) ──────────
  useEffect(() => {
    if (!isCloudConfigured) {
      setReady(true);
      setStatus("disabled");
      return;
    }
    if (!user) {
      initialDoneRef.current = false;
      userIdRef.current = null;
      dirtyRef.current = false;
      setReady(false);
      setStatus("idle");
      return;
    }
    if (!hydrated) return;
    if (initialDoneRef.current && userIdRef.current === user.id) return;

    userIdRef.current = user.id;
    let cancelled = false;

    (async () => {
      setStatus("syncing");
      setReady(false);
      try {
        const remote = await fetchRemote(user.id);
        if (cancelled) return;
        const lastSynced = localStorage.getItem(syncedKey(user.id));

        if (!remote) {
          // Cloud is empty — seed it from whatever is on this device.
          const updatedAt = await pushRemote(user.id, readCloudSnapshot());
          localStorage.setItem(syncedKey(user.id), updatedAt);
          setLastSyncedAt(updatedAt);
        } else if (!lastSynced || remote.updatedAt > lastSynced) {
          // Remote is newer (or this is a fresh device) — adopt it.
          adoptRemote(remote.data);
          localStorage.setItem(syncedKey(user.id), remote.updatedAt);
          setLastSyncedAt(remote.updatedAt);
        } else {
          // Local is already in sync (or ahead with pending edits).
          setLastSyncedAt(lastSynced);
          if (dirtyRef.current) await pushRemote(user.id, readCloudSnapshot());
        }
        if (!cancelled) setStatus("synced");
      } catch {
        if (!cancelled) setStatus("offline");
      } finally {
        if (!cancelled) {
          initialDoneRef.current = true;
          setReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, hydrated, adoptRemote]);

  // ── Live push: save to the cloud whenever synced data changes ──────────
  useEffect(() => {
    if (!isCloudConfigured) return;
    const unsubscribe = useChronicle.subscribe(() => {
      if (!userIdRef.current || !initialDoneRef.current) return;
      if (applyingRef.current) return; // ignore our own remote-apply writes
      dirtyRef.current = true;
      setStatus("syncing");
      schedulePush();
    });
    return () => unsubscribe();
  }, [schedulePush]);

  // ── Pull on focus: pick up edits made on another device ────────────────
  useEffect(() => {
    if (!isCloudConfigured) return;
    const onFocus = async () => {
      const userId = userIdRef.current;
      if (!userId || !supabase || !initialDoneRef.current) return;
      if (dirtyRef.current || document.visibilityState === "hidden") return;
      try {
        const remote = await fetchRemote(userId);
        const lastSynced = localStorage.getItem(syncedKey(userId));
        if (remote && (!lastSynced || remote.updatedAt > lastSynced)) {
          adoptRemote(remote.data);
          localStorage.setItem(syncedKey(userId), remote.updatedAt);
          setLastSyncedAt(remote.updatedAt);
          setStatus("synced");
        }
      } catch {
        /* stay on whatever status we had; focus pulls are best-effort */
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [adoptRemote]);

  const value = useMemo<SyncContextValue>(
    () => ({ status, ready, lastSyncedAt, syncNow }),
    [status, ready, lastSyncedAt, syncNow],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  return useContext(SyncContext);
}
