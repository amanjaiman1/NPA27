"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { LOCAL_ACCOUNT_ID } from "@/lib/account/scope";
import { AccountSession } from "./account-session";
import { BootScreen } from "./boot-screen";

/**
 * The gate in front of every page of the app.
 *
 * - No cloud configured: one local account, no sign-in (development builds).
 * - Session still resolving: a boot screen, never the previous person's data.
 * - Signed out: off to the welcome or sign-in screen.
 * - Signed in: the account's session, keyed by its id so a different account
 *   remounts everything from scratch.
 */
export function RequireAccount({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const signedOut = auth.cloudEnabled && auth.status === "signedOut";

  useEffect(() => {
    if (!signedOut) return;
    const next = pathname && pathname !== "/" ? `next=${encodeURIComponent(pathname)}` : "";
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
  if (auth.status !== "signedIn" || !auth.user) return <BootScreen />;
  return (
    <AccountSession key={auth.user.id} accountId={auth.user.id} mode="cloud" user={auth.user}>
      {children}
    </AccountSession>
  );
}
