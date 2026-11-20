"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CloudOff, LogOut, ShieldOff } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { BootScreen, StatusScreen } from "@/components/account/boot-screen";
import { adminApi, apiCall, ApiError, useAdminView } from "@/lib/platform/client";
import { noteAdminLoad, resetAdminRefresh } from "@/lib/platform/admin-refresh";
import { forgetRole, rememberRole } from "@/lib/platform/my-role";
import { releasePushSubscription } from "@/lib/push";
import { can, type Actor } from "@/lib/platform/roles";
import { leaveDemo } from "@/lib/demo/mode";
import { useAccountUpdates, useAdminUpdates } from "@/components/platform/live-updates";
import { AdminContext, type AdminContextValue } from "./admin-context";
import { AdminShell } from "./admin-shell";

type Gate =
  | { state: "checking" }
  | { state: "ready"; actor: Actor }
  | { state: "denied" }
  | { state: "error"; message: string; status: number };

const linkClass =
  "inline-flex h-11 items-center justify-center rounded-full bg-accent px-5 text-sm font-semibold text-accent-fg shadow-accent transition-all hover:brightness-[1.06]";
const quietClass =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full border border-line px-5 text-sm font-semibold text-paper/75 transition-colors hover:border-paper/25 hover:text-paper";

/** How long signing out waits for the server to forget this device's notifications before going anyway. */
const PUSH_UNSUBSCRIBE_WAIT_MS = 400;

/**
 * The Admin Center's front door. Nothing renders until the server has
 * verified the session and confirmed a role (GET /api/admin/me). Every page
 * inside still gets its data from routes that check again, so this is about
 * what to show, not what anyone may do.
 */
export function AdminRoot({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [gate, setGate] = useState<Gate>({ state: "checking" });
  const [leaving, setLeaving] = useState(false);
  /** "Try again" on the error screen: the same check, without reloading the page. */
  const [attempt, setAttempt] = useState(0);
  const leavingRef = useRef(false);
  const userId = auth.status === "signedIn" ? auth.user?.id : null;

  // Refresh Data's record belongs to one session: another account, or none, starts it afresh.
  useEffect(() => () => resetAdminRefresh(), [userId]);

  // An administrator acts as themselves: opening the Admin Center ends the
  // interactive demo in this tab. First, before anything below asks the API.
  useEffect(() => leaveDemo(), []);

  useEffect(() => {
    if (!auth.cloudEnabled) return;
    if (auth.status === "signedOut") {
      // Signed out here: the sign-in screen, clean. Ended elsewhere: say so, and come back here after.
      if (auth.endedReason === "signedOut") router.replace("/login");
      else router.replace(`/login?${auth.endedReason === "ended" ? "ended=1&" : ""}next=${encodeURIComponent(pathname || "/admin")}`);
      return;
    }
    if (!userId) return;
    let live = true;
    setGate({ state: "checking" });
    apiCall<Actor>("/api/admin/me")
      .then((actor) => {
        if (!live) return;
        // What the server confirmed is what this browser remembers, so the app routes this account correctly.
        rememberRole(userId, actor.role);
        noteAdminLoad("role", "opened");
        setGate({ state: "ready", actor });
      })
      .catch((e: unknown) => {
        if (!live) return;
        if (e instanceof ApiError && e.status === 401) {
          router.replace(`/login?ended=1&next=${encodeURIComponent(pathname || "/admin")}`);
        } else if (e instanceof ApiError && e.status === 403) {
          // No role (or suspended): forgotten here too, so the app opens for this account again.
          rememberRole(userId, null);
          setGate({ state: "denied" });
        } else {
          setGate({ state: "error", message: e instanceof Error ? e.message : "Something went wrong.", status: e instanceof ApiError ? e.status : 0 });
        }
      });
    return () => {
      live = false;
    };
    // The role is checked once per account; each page's data is checked on every call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.cloudEnabled, auth.status, userId, attempt]);

  /**
   * Asks the server again, quietly: this account's role changed, or a
   * setting that widens what a role may do (live updates), or Refresh Data.
   * The page stays as it is unless the answer changes it: new permissions
   * show at once, and a removed role ends at "No access". Rejects when the
   * question couldn't be answered, keeping what's shown.
   */
  const confirmRole = useCallback(
    async (get: <T>(path: string) => Promise<T> = (path) => adminApi.get(path)) => {
      if (!userId) return;
      try {
        const actor = await get<Actor>("me");
        rememberRole(userId, actor.role);
        setGate((g) => (g.state === "ready" && JSON.stringify(g.actor) === JSON.stringify(actor) ? g : { state: "ready", actor }));
      } catch (e) {
        if (e instanceof ApiError && e.status === 403) {
          rememberRole(userId, null);
          setGate({ state: "denied" });
        } else if (e instanceof ApiError && e.status === 401) {
          router.replace(`/login?ended=1&next=${encodeURIComponent(pathname || "/admin")}`);
        }
        throw e;
      }
    },
    [userId, router, pathname],
  );
  // Offline or a hiccup on a live update: keep what's shown.
  const reconfirm = useCallback(
    () =>
      void confirmRole().then(
        () => noteAdminLoad("role", "live"),
        () => undefined,
      ),
    [confirmRole],
  );
  const confirmed = gate.state === "ready" || gate.state === "denied";
  useAccountUpdates(userId, ["role"], reconfirm, confirmed);
  useAdminUpdates(["access"], reconfirm, gate.state === "ready");
  // Your role takes part in Refresh Data like any page's data.
  useAdminView(gate.state === "ready" ? "role" : null, "me", (ctx) => confirmRole(ctx.get));

  /**
   * Signing out of the Admin Center ends the session on this device, as the
   * app's sign-out does: this device stops receiving the account's
   * notifications, and the role this browser remembered goes. The Admin
   * Center holds no student data, so there is nothing to sync first.
   */
  const signOut = useCallback(async () => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    router.prefetch("/login");
    const id = auth.user?.id;
    // The request that stops this device's notifications carries the session's
    // token, so it goes first; the browser's part finishes in the background.
    const push = releasePushSubscription(auth.accessToken());
    await Promise.race([push.told, new Promise((resolve) => setTimeout(resolve, PUSH_UNSUBSCRIBE_WAIT_MS))]);
    if (id) forgetRole(id);
    await auth.signOut();
    // The effect above then goes to the sign-in screen.
  }, [auth, router]);

  const signOutButton = (
    <button type="button" onClick={() => void signOut()} className={quietClass}>
      <LogOut className="h-4 w-4" aria-hidden /> Sign out
    </button>
  );

  if (leaving) return <BootScreen label="Signing out…" />;
  if (!auth.cloudEnabled) {
    return (
      <StatusScreen icon={CloudOff} title="The Admin Center needs accounts" body="This copy of DoOrDie runs without Supabase, so there are no accounts or roles to manage.">
        <Link href="/dashboard" className={linkClass}>
          Back to DoOrDie
        </Link>
      </StatusScreen>
    );
  }
  if (gate.state === "denied") {
    return (
      <StatusScreen icon={ShieldOff} title="No access" body="This account doesn't have an Admin Center role. If you think it should, ask the platform's owner.">
        <Link href="/dashboard" className={linkClass}>
          Back to DoOrDie
        </Link>
        {signOutButton}
      </StatusScreen>
    );
  }
  if (gate.state === "error") {
    return (
      <StatusScreen icon={CloudOff} title={gate.status === 503 ? "Not set up yet" : "Couldn't open the Admin Center"} body={gate.message}>
        <button type="button" onClick={() => setAttempt((a) => a + 1)} className={linkClass}>
          Try again
        </button>
        {signOutButton}
      </StatusScreen>
    );
  }
  if (gate.state !== "ready") return <BootScreen label="Checking your access…" />;

  const value: AdminContextValue = {
    actor: gate.actor,
    can: (p) => can(gate.actor, p),
    signOut: () => void signOut(),
  };
  return (
    <AdminContext.Provider value={value}>
      <AdminShell>{children}</AdminShell>
    </AdminContext.Provider>
  );
}
