"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { AuthFrame, queryParam, safeNext } from "@/components/auth/auth-ui";
import { BootScreen } from "@/components/account/boot-screen";

/** Pages that must stay reachable while a session exists. */
const SIGNED_IN_OK = new Set(["/reset-password", "/auth/callback"]);

/**
 * Welcome, sign-in, sign-up and password screens. A signed-in visitor is sent
 * on into the app; a build without accounts has no use for any of them.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const allowSignedIn = SIGNED_IN_OK.has(pathname);
  const leave = !auth.cloudEnabled || (auth.status === "signedIn" && !allowSignedIn);

  useEffect(() => {
    if (!auth.cloudEnabled) router.replace("/");
    else if (auth.status === "signedIn" && !allowSignedIn) router.replace(safeNext(queryParam("next")));
  }, [auth.cloudEnabled, auth.status, allowSignedIn, router]);

  if (leave || auth.status === "loading") return <BootScreen />;
  return <AuthFrame>{children}</AuthFrame>;
}
