"use client";

import { useEffect } from "react";
import { useChronicle } from "@/lib/store";
import { AUTH_STORAGE_KEY, isCloudConfigured } from "@/lib/supabase";
import { LOCAL_ACCOUNT_ID, STORE_KEY, getActiveAccountId, readKey } from "@/lib/account/scope";
import { reportCrash, setCrashConsentSource } from "@/lib/crash-report";

/**
 * The signed-in person's saved choice, read from this browser's copy of
 * their account. Used when no account is loaded: while the app starts, or
 * after a failure took the account's screens down with it.
 */
function savedChoice(): boolean | null {
  try {
    const id = isCloudConfigured
      ? (JSON.parse(readKey(AUTH_STORAGE_KEY) ?? "null") as { user?: { id?: unknown } } | null)?.user?.id
      : LOCAL_ACCOUNT_ID;
    if (typeof id !== "string") return null;
    const saved = JSON.parse(readKey(`${STORE_KEY}:${id}`) ?? "null") as { state?: { profile?: { crashReports?: unknown } } } | null;
    return saved?.state?.profile ? saved.state.profile.crashReports !== false : null;
  } catch {
    return null;
  }
}

// The account's choice about automatic crash reports (Help & feedback):
// from the loaded account, else from its saved copy, else null.
// Registered as this module loads, before anything renders, so an error
// screen that appears in the app's first moment still reads the right answer.
setCrashConsentSource(() => {
  if (getActiveAccountId()) {
    const state = useChronicle.getState();
    if (state._hasHydrated) return state.profile.crashReports !== false;
  }
  return savedChoice();
});

/**
 * Reports errors that no error screen caught, on every screen of the app
 * and its sign-in pages: a failure in a button's handler, a timer or a
 * background task. Only errors from this site's own code; a script another
 * site or an extension added is skipped.
 */
export function CrashReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      if (!(event.error instanceof Error)) return;
      if (event.filename && !event.filename.startsWith(window.location.origin)) return;
      void reportCrash({ error: event.error, source: "window" });
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      if (!(event.reason instanceof Error)) return;
      void reportCrash({ error: event.reason, source: "promise" });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
