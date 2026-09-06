"use client";

import { useAuth } from "./auth-provider";
import { useSync } from "./sync-provider";
import { Login } from "./login";
import { useHasHydrated } from "@/lib/store";
import { LottieWithFallback } from "@/components/ui/lottie";

function FullScreen({ label }: { label: string }) {
  return (
    <div className="relative grid min-h-[100dvh] place-items-center overflow-hidden">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-aura" />
      </div>
      <div className="flex flex-col items-center gap-5 text-center">
        {/* Signing in and the first cloud pull are both cold-start waits, so
            they get the same ring the app boots with. */}
        <LottieWithFallback
          src="/animations/boot.json"
          className="h-24 w-24"
          fallbackClassName="boot-ring h-[4.5rem] w-[4.5rem]"
          staticFrame={18}
          label={label}
        />
        <span className="text-sm text-paper/55">{label}</span>
      </div>
    </div>
  );
}

/**
 * Decides whether to show the login screen, a loading state, or the app.
 *
 * - Cloud not configured  → render the app directly (local-only mode).
 * - Resolving session     → loader.
 * - No user               → login screen.
 * - Signed in             → wait for the initial cloud pull, then the app.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { cloudEnabled, loading, user } = useAuth();
  const { ready } = useSync();
  const hydrated = useHasHydrated();

  if (!cloudEnabled) return <>{children}</>;
  if (loading) return <FullScreen label="Loading…" />;
  if (!user) return <Login />;
  if (!hydrated || !ready) return <FullScreen label="Syncing your chronicle…" />;
  return <>{children}</>;
}
