"use client";

import { Cloud, CloudOff, RefreshCw, Check, LogOut } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { useSync } from "@/components/auth/sync-provider";
import { cn } from "@/lib/utils";

const META: Record<
  string,
  { label: string; dot: string; Icon: typeof Cloud; spin?: boolean }
> = {
  syncing: { label: "Syncing…", dot: "bg-amber-400", Icon: RefreshCw, spin: true },
  synced: { label: "Synced", dot: "bg-emerald-400", Icon: Check },
  offline: { label: "Offline", dot: "bg-paper/40", Icon: CloudOff },
  error: { label: "Sync error", dot: "bg-rose-400", Icon: CloudOff },
  idle: { label: "Cloud", dot: "bg-paper/40", Icon: Cloud },
};

export function SyncStatus() {
  const { cloudEnabled, user, signOut } = useAuth();
  const { status } = useSync();

  // Local-only mode (no cloud configured) shows nothing.
  if (!cloudEnabled || !user) return null;

  const meta = META[status] ?? META.idle;
  const Icon = meta.Icon;

  return (
    <div className="flex items-center gap-1">
      <span
        title={user.email ?? undefined}
        className="hidden items-center gap-1.5 rounded-full border border-paper/10 bg-paper/[0.03] px-2.5 py-1.5 text-xs text-paper/70 sm:flex"
      >
        <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
        <Icon className={cn("h-3.5 w-3.5 text-paper/45", meta.spin && "animate-spin")} />
        <span className="tracking-snugg">{meta.label}</span>
      </span>
      <button
        onClick={() => void signOut()}
        title="Sign out"
        aria-label="Sign out"
        className="grid h-9 w-9 place-items-center rounded-lg text-paper/60 transition-colors hover:bg-paper/[0.06] hover:text-paper"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}
