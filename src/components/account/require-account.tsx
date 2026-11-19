"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { readStoredSessionUser, useAuth, type AccountUser } from "@/components/auth/auth-provider";
import { LOCAL_ACCOUNT_ID } from "@/lib/account/scope";
import { initialAuthRedirect } from "@/lib/supabase";
import { AccountSession } from "./account-session";
import { BootScreen } from "./boot-screen";

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
 * - Signed in: the account's session, keyed by its id so a different account
 *   remounts everything from scratch.
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
  useEffect(() => {
    if (auth.cloudEnabled && !initialAuthRedirect) setSaved(readStoredSessionUser());
    // Read once: from here on, the auth state decides.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!signedOut) return;
    const next = pathname && pathname !== "/dashboard" ? `next=${encodeURIComponent(pathname)}` : "";
    if (auth.endedReason === "signedOut") router.replace("/welcome");
    else if (auth.endedReason === "ended") router.replace(`/login?ended=1${next ? `&${next}` : ""}`);
    else router.replace(next ? `/login?${next}` : "/welcome");
  }, [signedOut, auth.endedReason, pathname, router]);

  if (!auth.cloudEnabled) {
    return (
      <AccountSession accountId={LOCAL_ACCOUNT_ID} mode="local" user={null}>
        {children}
      </AccountSession>
    );
  }
  const user = auth.status === "signedIn" ? auth.user : auth.status === "loading" ? saved : null;
  if (!user) return <BootScreen />;
  // The same key once the session is confirmed, so nothing remounts.
  return (
    <AccountSession key={user.id} accountId={user.id} mode="cloud" user={user}>
      {children}
    </AccountSession>
  );
}
