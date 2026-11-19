"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { readStoredSessionUser, useAuth, type AccountUser } from "@/components/auth/auth-provider";
import { LOCAL_ACCOUNT_ID } from "@/lib/account/scope";
import { initialAuthRedirect } from "@/lib/supabase";
import { isDemo } from "@/lib/demo/mode";
import { DemoSession } from "@/components/demo/demo-session";
import { AccountSession } from "./account-session";
import { BootScreen } from "./boot-screen";
import { useAccountKind } from "./use-platform-role";

/**
 * The gate in front of every page of the app.
 *
 * - No cloud configured: one local account, no sign-in (development builds).
 * - Signed in on this device before: the account opens at once, from the data
 *   this device already holds, while the session is confirmed in the
 *   background (see below).
 * - Session still resolving, and none saved here: a boot screen, never the
 *   previous person's data.
 * - Signed out: off to the welcome or sign-in screen.
 * - A Super Admin: off to the Admin Center. That account runs the platform,
 *   so it never loads a chronicle, goes through student setup or sees the
 *   dashboard (see `useAccountKind`).
 * - Signed in: the account's session, keyed by its id so a different account
 *   remounts everything from scratch.
 * - The interactive demo, in this tab: the sample account, whoever is or isn't
 *   signed in here, with nothing loaded from or saved to any account.
 */
export function RequireAccount({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const signedOut = auth.cloudEnabled && auth.status === "signedOut";

  /**
   * The session saved on this device, read once the page is running.
   *
   * Confirming a session means asking the auth server for a fresh access token
   * whenever the last one has expired, which it does an hour after the app was
   * last used. The app used to wait for that answer before showing anything: a
   * round trip on every morning's first open, and close to a minute on the boot
   * screen with no connection, because the request is retried for that long.
   *
   * The data is already on this device and belongs to the person signed in
   * here, so it opens straight away, and the answer arrives in the background.
   * Sync waits for it on its own. If the server says the session has ended
   * (signed out everywhere, password changed), the app leaves for the sign-in
   * screen exactly as it does when a session ends mid-use.
   *
   * Not when the address carries a sign-in link's tokens: that link may be for
   * someone else, and must be read first.
   */
  const [saved, setSaved] = useState<AccountUser | null>(null);
  // The demo flag lives in this tab's sessionStorage, which the server can't
  // see: read after mounting, so the first render matches the server's.
  const [demo, setDemo] = useState<boolean | null>(null);
  useEffect(() => {
    if (auth.cloudEnabled && !initialAuthRedirect) setSaved(readStoredSessionUser());
    setDemo(isDemo());
    // Read once: from here on, the auth state decides.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // A visitor in the demo has no account, and that's fine.
    if (!signedOut || demo !== false) return;
    const next = pathname && pathname !== "/dashboard" ? `next=${encodeURIComponent(pathname)}` : "";
    if (auth.endedReason === "signedOut") router.replace("/welcome");
    else if (auth.endedReason === "ended") router.replace(`/login?ended=1${next ? `&${next}` : ""}`);
    else router.replace(next ? `/login?${next}` : "/welcome");
  }, [signedOut, demo, auth.endedReason, pathname, router]);

  const user = !auth.cloudEnabled ? null : auth.status === "signedIn" ? auth.user : auth.status === "loading" ? saved : null;
  // Not asked in the demo: it would use the session of whoever is signed in here.
  const kind = useAccountKind(demo === false ? (user?.id ?? null) : null);

  useEffect(() => {
    if (kind === "admin" && demo === false) router.replace("/admin");
  }, [kind, demo, router]);

  if (demo === null) return <BootScreen />;
  if (demo) {
    // Leaving goes back to the person's own account if they have one here
    // (for a Super Admin, the Admin Center, through the redirect above).
    const own = !auth.cloudEnabled || user !== null;
    return <DemoSession exitTo={own ? "/dashboard" : "/demo?left=1"}>{children}</DemoSession>;
  }
  if (!auth.cloudEnabled) {
    return (
      <AccountSession accountId={LOCAL_ACCOUNT_ID} mode="local" user={null}>
        {children}
      </AccountSession>
    );
  }
  if (!user || kind === "checking") return <BootScreen />;
  if (kind === "admin") return <BootScreen label="Opening the Admin Center…" />;
  // The same key once the session is confirmed, so nothing remounts.
  return (
    <AccountSession key={user.id} accountId={user.id} mode="cloud" user={user}>
      {children}
    </AccountSession>
  );
}
