"use client";

import { Loader2 } from "lucide-react";
import { useAuth } from "./auth-provider";
import { useSync } from "./sync-provider";
import { Login } from "./login";
import { useHasHydrated } from "@/lib/store";
import { Logo } from "@/components/layout/logo";

function FullScreen({ label }: { label: string }) {
  return (
    <div className="relative grid min-h-[100dvh] place-items-center overflow-hidden">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-bloom-field" />
        <div className="bloom-scrim absolute inset-0" />
      </div>
      <div className="flex flex-col items-center gap-4 text-center">
        <Logo className="h-10 w-10" />
        <div className="flex items-center gap-2 text-sm text-paper/55">
          <Loader2 className="h-4 w-4 animate-spin" />
          {label}
        </div>
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
