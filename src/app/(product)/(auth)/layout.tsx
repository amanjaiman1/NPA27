"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { AuthFrame, queryParam } from "@/components/auth/auth-ui";
import { landingAfterSignIn } from "@/components/auth/landing";
import { BootScreen } from "@/components/account/boot-screen";
import { Analytics } from "@/components/marketing/analytics";

/** Pages that must stay reachable while a session exists. */
const SIGNED_IN_OK = new Set(["/reset-password", "/auth/callback"]);

/**
 * Welcome, sign-in, sign-up and password screens. A signed-in visitor is sent
 * on: a Super Admin to the Admin Center, everyone else into the app (see
 * `landingAfterSignIn`). A build without accounts has no use for any of them.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const allowSignedIn = SIGNED_IN_OK.has(pathname);
  const leave = !auth.cloudEnabled || (auth.status === "signedIn" && !allowSignedIn);
  const userId = auth.status === "signedIn" ? (auth.user?.id ?? null) : null;

  useEffect(() => {
    if (!auth.cloudEnabled) {
      router.replace("/dashboard");
      return;
    }
    if (!userId || allowSignedIn) return;
    let live = true;
    void landingAfterSignIn(userId, queryParam("next"), { offline: auth.offline }).then((to) => {
      if (live) router.replace(to);
    });
    return () => {
      live = false;
    };
  }, [auth.cloudEnabled, auth.offline, userId, allowSignedIn, router]);

  if (leave || auth.status === "loading") return <BootScreen />;
  // Analytics (opt-in, when configured) covers the sign-up journey, so a
  // registration can be measured. It stops sending once the app itself opens.
  return (
    <>
      <AuthFrame>{children}</AuthFrame>
      <Analytics />
    </>
  );
}
