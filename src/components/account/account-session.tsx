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
import { CloudOff, RefreshCw } from "lucide-react";
import { useAuth, type AccountUser } from "@/components/auth/auth-provider";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { SyncEngine, type SyncState } from "@/lib/sync/engine";
import { createSupabaseTransport } from "@/lib/sync/supabase-transport";
import { createBaseStore } from "@/lib/sync/base-store";
import { chronicleStoreAdapter } from "@/lib/sync/store-adapter";
import { startCoordinator, type Coordinator, type SyncRole } from "@/lib/sync/coordinator";
import { settleLegacyClaim } from "@/lib/account/legacy";
import { unsubscribeFromPush } from "@/lib/push";
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

interface AccountContextValue {
  accountId: string;
  mode: AccountMode;
  user: AccountUser | null;
  sync: SyncView;
  conflicts: ConflictRecord[];
  syncNow: () => void;
  /** Pushes pending changes; true when everything is in the cloud. */
  flush: (timeoutMs?: number) => Promise<boolean>;
  /** Syncs, then signs out and clears this browser's copy of the account. */
  signOut: () => Promise<void>;
  /** For account deletion: stop everything and wipe this browser's copy. */
  endAfterDeletion: () => Promise<void>;
  dismissConflicts: () => void;
}

const AccountContext = createContext<AccountContextValue | null>(null);

const IDLE: SyncView = {
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
  mode: AccountMode;
  user: AccountUser | null;
  children: React.ReactNode;
}) {
  const auth = useAuth();
  const confirm = useConfirm();
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

      // Look for changes from other devices when the student comes back to the
      // app, comes back online, and every few minutes while it's on screen.
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

  const signOut = useCallback(async () => {
    const synced = await flush(8_000);
    if (!synced) {
      const go = await confirm({
        title: "Some changes haven't synced yet",
        description:
          "They stay saved in this browser, for your account only, and sync the next time you sign in here. Sign out anyway?",
        confirmLabel: "Sign out",
        tone: "default",
      });
      if (!go) return;
    }
    setPhase("leaving");
    // While the session is still valid: stop this device receiving this
    // account's notifications.
    await unsubscribeFromPush().catch(() => false);
    coordinator.current?.stop();
    coordinator.current = null;
    deactivateAccount();
    if (synced) await eraseAccountFromDevice(accountId);
    await auth.signOut();
  }, [accountId, auth, confirm, flush]);

  const endAfterDeletion = useCallback(async () => {
    setPhase("leaving");
    coordinator.current?.stop();
    coordinator.current = null;
    deactivateAccount();
    await eraseAccountFromDevice(accountId);
    await auth.signOut();
  }, [accountId, auth]);

  const value = useMemo<AccountContextValue>(
    () => ({
      accountId,
      mode,
      user,
      sync,
      conflicts,
      syncNow: () => coordinator.current?.syncNow(),
      flush,
      signOut,
      endAfterDeletion,
      dismissConflicts: () => {
        clearConflicts(accountId);
        setConflicts([]);
      },
    }),
    [accountId, mode, user, sync, conflicts, flush, signOut, endAfterDeletion],
  );

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

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountContextValue {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useAccount must be used within an AccountSession");
  return ctx;
}
