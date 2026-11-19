"use client";

/* The interactive demo's stand-in for a signed-in session. It loads the
   sample account into memory with no account active, so the store can't
   write it anywhere (lib/account/scope.ts drops every write), and gives the
   pages an account context whose mode is "demo": nothing syncs, the inbox,
   reviews, feedback and attachments stay off, and "sign out" leaves the demo.
   See lib/demo/mode.ts. */

import { useEffect, useMemo, useState } from "react";
import { blankChronicleState, useChronicle } from "@/lib/store";
import { setActiveAccount } from "@/lib/account/scope";
import { deactivateAccount } from "@/lib/account/session";
import { exitDemo, loadSampleAccount } from "@/lib/demo/load";
import { markDemoMounted } from "@/lib/demo/mode";
import { IDLE, StaticAccountProvider, type AccountContextValue } from "@/components/account/account-session";
import { BootScreen } from "@/components/account/boot-screen";

export const DEMO_ACCOUNT_ID = "demo";

export function DemoSession({ exitTo, children }: { exitTo: string; children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    markDemoMounted(true);
    // Nothing of any account in memory while the sample downloads.
    setActiveAccount(null);
    useChronicle.setState(blankChronicleState());
    void loadSampleAccount().then(() => live && setReady(true));
    return () => {
      live = false;
      markDemoMounted(false);
      deactivateAccount();
    };
  }, []);

  const value = useMemo<AccountContextValue>(
    () => ({
      accountId: DEMO_ACCOUNT_ID,
      mode: "demo",
      user: null,
      sync: IDLE,
      conflicts: [],
      syncNow: () => undefined,
      flush: async () => true,
      signOut: async () => exitDemo(exitTo),
      endAfterDeletion: async () => exitDemo(exitTo),
      dismissConflicts: () => undefined,
    }),
    [exitTo],
  );

  if (!ready) return <BootScreen label="Opening the demo…" />;
  return <StaticAccountProvider value={value}>{children}</StaticAccountProvider>;
}
