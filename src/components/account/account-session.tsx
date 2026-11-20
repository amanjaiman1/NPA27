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
import { useRouter } from "next/navigation";
import { CloudOff, RefreshCw } from "lucide-react";
import { useAuth, type AccountUser } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { SyncEngine, type SyncState } from "@/lib/sync/engine";
import { createSupabaseTransport } from "@/lib/sync/supabase-transport";
import { createBaseStore } from "@/lib/sync/base-store";
import { chronicleStoreAdapter } from "@/lib/sync/store-adapter";
import { startCoordinator, type Coordinator, type SyncRole } from "@/lib/sync/coordinator";
import { settleLegacyClaim } from "@/lib/account/legacy";
import { releasePushSubscription } from "@/lib/push";
import { forgetRole } from "@/lib/platform/my-role";
import { accountTopic } from "@/lib/platform/live";
import { subscribeLive } from "@/components/platform/live-updates";
import {
  activateAccount,
  clearConflicts,
  deactivateAccount,
  eraseAccountFromDevice,
  isDeviceReady,
  markDeviceReady,
  readConflicts,
  recordConflicts,
  reloadFromStorage,
  storeKeyFor,
  type AccountMode,
  type ConflictRecord,
  type StoredAccountMode,
} from "@/lib/account/session";
import { BootScreen, StatusScreen } from "./boot-screen";

/* ════════════════════════════════════════════════════════════════
   THE SIGNED-IN SESSION
   Mounted once per account (keyed by its id), so switching accounts
   unmounts every page, form and cache of the previous one. It loads the
   account's data into the store, runs cloud sync for it, and owns
   signing out. Nothing renders until the right account's data is loaded.
   ════════════════════════════════════════════════════════════════ */

export interface SyncView extends SyncState {
  role: SyncRole | "local";
}

/**
 * Who is signed in and what can be done with the session. Stable for the
 * whole session: nothing in it changes when a change is saved, so the app
 * shell and every page that reads it don't re-render on each save.
 */
export interface AccountContextValue {
  accountId: string;
  mode: AccountMode;
  user: AccountUser | null;
  syncNow: () => void;
  /** Pushes pending changes; true when everything is in the cloud. */
  flush: (timeoutMs?: number) => Promise<boolean>;
  /**
   * Signs out of this device at once: a last save for a moment, then the
   * session ends and the welcome screen opens. Anything the cloud hasn't
   * confirmed stays in this browser, for this account only, and syncs at the
   * next sign-in here.
   */
  signOut: () => Promise<void>;
  /** For account deletion: stop everything and wipe this browser's copy. */
  endAfterDeletion: () => Promise<void>;
  dismissConflicts: () => void;
}

/**
 * The sync status and the edits that clashed between devices. Changes on
 * every save (pending, syncing, synced), so it has a context of its own,
 * read only by what shows it.
 */
export interface SyncStatusValue {
  sync: SyncView;
  conflicts: ConflictRecord[];
}

const AccountContext = createContext<AccountContextValue | null>(null);
const SyncStatusContext = createContext<SyncStatusValue | null>(null);

/**
 * How long signing out waits for a last save before going anyway. On an
 * ordinary connection a save is well inside it; on a slow or broken one the
 * changes stay on this device (they're already saved here) and sync at the
 * next sign-in, rather than holding the student on a waiting screen.
 */
export const SIGN_OUT_SYNC_WAIT_MS = 1_000;
/** How long signing out waits for the browser to forget the last-synced copy. */
const SIGN_OUT_ERASE_WAIT_MS = 400;

/** `promise`'s value, or `fallback` once `ms` have passed. Never rejects. */
function within<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

export const IDLE: SyncView = {
  status: "idle",
  pending: false,
  lastSyncedAt: null,
  error: null,
  errorKind: null,
  role: "local",
};

const REMOTE_CHECK_MS = 3 * 60_000;

type Phase = "loading" | "ready" | "unavailable" | "leaving";

export function AccountSession({
  accountId,
  mode,
  user,
  children,
}: {
  accountId: string;
  mode: StoredAccountMode;
  user: AccountUser | null;
  children: React.ReactNode;
}) {
  const auth = useAuth();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [sync, setSync] = useState<SyncView>(IDLE);
  const [conflicts, setConflicts] = useState<ConflictRecord[]>([]);
  const coordinator = useRef<Coordinator | null>(null);

  useEffect(() => {
    let cancelled = false;
    let coord: Coordinator | null = null;
    const cleanups: (() => void)[] = [];
    setPhase("loading");

    void (async () => {
      const activation = await activateAccount(accountId, mode);
      if (cancelled) return;
      setConflicts(readConflicts(accountId));

      // Another tab of this account saved: pick it up, so tabs never diverge.
      const onStorage = (e: StorageEvent) => {
        if (e.key === storeKeyFor(accountId) && e.newValue) reloadFromStorage();
      };
      window.addEventListener("storage", onStorage);
      cleanups.push(() => window.removeEventListener("storage", onStorage));

      if (mode === "local" || !supabase) {
        setSync(IDLE);
        setPhase("ready");
        return;
      }
      const client = supabase;

      // Usable without waiting for the network when this browser already holds
      // the account's data. A fresh browser waits for the first download.
      const hasLocalData = isDeviceReady(accountId) || !activation.pristine;

      coord = startCoordinator({
        accountId,
        createEngine: (onState) =>
          new SyncEngine({
            transport: createSupabaseTransport(client, accountId),
            store: chronicleStoreAdapter(),
            baseStore: createBaseStore(accountId),
            pristine: activation.pristine,
            legacy: activation.legacy,
            onState,
            onConflicts: (found) => setConflicts(recordConflicts(accountId, found)),
            onLegacySettled: () => settleLegacyClaim(accountId),
          }),
        onState: (state) => {
          if (cancelled) return;
          setSync((prev) => ({ ...state, role: prev.role }));
          if (state.lastSyncedAt) {
            markDeviceReady(accountId);
            setPhase((p) => (p === "loading" || p === "unavailable" ? "ready" : p));
          } else if (state.status === "offline" || state.status === "error") {
            setPhase((p) => (p === "loading" ? (hasLocalData ? "ready" : "unavailable") : p));
          }
        },
        onRole: (role) => {
          if (cancelled) return;
          setSync((prev) => ({ ...prev, role }));
        },
      });
      coordinator.current = coord;
      if (hasLocalData) setPhase("ready");

      // The moment another device saves this account, look (a live update; the
      // version says when it's this device's own save). A suspension or deletion
      // made elsewhere ends the session here too, at once rather than within the
      // hour its token has left: the refresh is refused and the app signs out.
      const topic = accountTopic(accountId);
      cleanups.push(subscribeLive(topic, ["chronicle"], (p) => coord?.checkRemote({ version: p.version ?? null })));
      cleanups.push(
        subscribeLive(topic, ["session"], (p) => {
          if (!p.catchUp) void client.auth.refreshSession().catch(() => undefined);
        }),
      );

      // And as before: when the student comes back to the app, comes back
      // online, and every few minutes while it's on screen.
      let focusTimer: ReturnType<typeof setTimeout> | null = null;
      const onFocus = () => {
        if (document.visibilityState !== "visible") return;
        if (focusTimer) clearTimeout(focusTimer);
        focusTimer = setTimeout(() => coord?.checkRemote(), 600);
      };
      const onOnline = () => coord?.syncNow();
      const interval = setInterval(() => {
        if (document.visibilityState === "visible") coord?.checkRemote();
      }, REMOTE_CHECK_MS);
      window.addEventListener("focus", onFocus);
      document.addEventListener("visibilitychange", onFocus);
      window.addEventListener("online", onOnline);
      cleanups.push(() => {
        if (focusTimer) clearTimeout(focusTimer);
        clearInterval(interval);
        window.removeEventListener("focus", onFocus);
        document.removeEventListener("visibilitychange", onFocus);
        window.removeEventListener("online", onOnline);
      });
    })();

    return () => {
      cancelled = true;
      coord?.stop();
      coordinator.current = null;
      cleanups.forEach((fn) => fn());
      deactivateAccount();
    };
  }, [accountId, mode]);

  const flush = useCallback(
    (timeoutMs = 8_000) =>
      mode === "local"
        ? Promise.resolve(true)
        : (coordinator.current?.flush(timeoutMs) ?? Promise.resolve(false)),
    [mode],
  );

  /**
   * Signing out, in the order that keeps accounts apart and the student
   * moving:
   *
   *   1. At once: the app gives way to "Signing out…", so nothing more can be
   *      edited, and a second press does nothing. The welcome screen is
   *      fetched meanwhile, so it opens the moment the session ends.
   *   2. Everything already edited is in this browser, under this account's
   *      own key (the store writes on every change), whatever the network does.
   *   3. One last save, given SIGN_OUT_SYNC_WAIT_MS. Alongside it, this
   *      device's background notifications are stopped: the request carries
   *      this session's token, so it has to go before the session ends.
   *   4. Sync stops and the account is unloaded: writes off and storage
   *      detached first, then memory cleared (lib/account/session.ts).
   *   5. The session ends on this device (AuthProvider.signOut, bounded too),
   *      and the welcome screen opens.
   *   6. The rest happens in the background: the browser forgets its push
   *      subscription, and this browser's copy of the account goes once the
   *      cloud confirmed it has everything. If it didn't, the copy stays,
   *      for this account only, and syncs at the next sign-in here; the
   *      welcome screen says so.
   */
  const leaving = useRef(false);
  const signOut = useCallback(async () => {
    if (leaving.current) return;
    leaving.current = true;
    setPhase("leaving");
    router.prefetch("/welcome");
    const startedAt = Date.now();
    const push = releasePushSubscription(auth.accessToken());
    const saving = within(flush(SIGN_OUT_SYNC_WAIT_MS), SIGN_OUT_SYNC_WAIT_MS + 100, false);
    // The save and the push request share one wait. The push request is short;
    // if the connection is too slow for it, the browser's own unsubscribe
    // (already under way) still ends this device's notifications.
    const pushed = await saving;
    await within(push.told, Math.max(0, SIGN_OUT_SYNC_WAIT_MS - (Date.now() - startedAt)), undefined);
    // Nothing left to send counts as synced, but only when this tab's own
    // engine can say so: a tab that follows another can't, and keeps its copy.
    const synced = pushed || coordinator.current?.hasUnsyncedChanges() === false;
    // A save that couldn't finish in time says the connection is slow: then the
    // auth server isn't waited on for long either (it finishes in the background).
    const slow = Date.now() - startedAt >= SIGN_OUT_SYNC_WAIT_MS;
    coordinator.current?.stop();
    coordinator.current = null;
    deactivateAccount();
    // The remembered Admin Center role goes either way; unsynced data stays.
    forgetRole(accountId);
    if (synced) await within(eraseAccountFromDevice(accountId), SIGN_OUT_ERASE_WAIT_MS, undefined);
    await auth.signOut({ landing: synced ? "/welcome" : "/welcome?unsynced=1", waitMs: slow ? 300 : undefined });
  }, [accountId, auth, flush, router]);

  const endAfterDeletion = useCallback(async () => {
    leaving.current = true;
    setPhase("leaving");
    coordinator.current?.stop();
    coordinator.current = null;
    deactivateAccount();
    await eraseAccountFromDevice(accountId);
    await auth.signOut();
  }, [accountId, auth]);

  const dismissConflicts = useCallback(() => {
    clearConflicts(accountId);
    setConflicts([]);
  }, [accountId]);
  const syncNow = useCallback(() => coordinator.current?.syncNow(), []);

  const value = useMemo<AccountContextValue>(
    () => ({ accountId, mode, user, syncNow, flush, signOut, endAfterDeletion, dismissConflicts }),
    [accountId, mode, user, syncNow, flush, signOut, endAfterDeletion, dismissConflicts],
  );
  const status = useMemo<SyncStatusValue>(() => ({ sync, conflicts }), [sync, conflicts]);

  if (phase === "leaving") return <BootScreen label="Signing out…" />;
  if (phase === "loading") return <BootScreen label="Loading your chronicle…" />;
  if (phase === "unavailable") {
    return (
      <StatusScreen
        icon={CloudOff}
        title="Can't load your chronicle yet"
        body={
          <>
            This browser doesn&apos;t have a copy of your data, and the cloud can&apos;t be
            reached right now.
            {sync.error && <span className="mt-2 block text-paper/45">{sync.error}</span>}
          </>
        }
      >
        <Button onClick={() => coordinator.current?.syncNow()}>
          <RefreshCw className="h-4 w-4" /> Try again
        </Button>
        {mode === "cloud" && (
          <Button variant="ghost" onClick={() => void auth.signOut()}>
            Sign out
          </Button>
        )}
      </StatusScreen>
    );
  }

  return (
    <AccountContext.Provider value={value}>
      <SyncStatusContext.Provider value={status}>{children}</SyncStatusContext.Provider>
    </AccountContext.Provider>
  );
}

export function useAccount(): AccountContextValue {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useAccount must be used within an AccountSession");
  return ctx;
}

/** The sync status and recorded clashes. Re-renders on every save: read it only where it's shown. */
export function useSyncStatus(): SyncStatusValue {
  const ctx = useContext(SyncStatusContext);
  if (!ctx) throw new Error("useSyncStatus must be used within an AccountSession");
  return ctx;
}

/**
 * An account context with no account behind it, for the interactive demo
 * (components/demo/demo-session.tsx): the pages read it exactly as they read
 * a real one, and nothing in it can sync, save or sign anyone out.
 */
export function StaticAccountProvider({
  value,
  status,
  children,
}: {
  value: AccountContextValue;
  status: SyncStatusValue;
  children: React.ReactNode;
}) {
  return (
    <AccountContext.Provider value={value}>
      <SyncStatusContext.Provider value={status}>{children}</SyncStatusContext.Provider>
    </AccountContext.Provider>
  );
}
