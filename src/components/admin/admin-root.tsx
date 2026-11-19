"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CloudOff, ShieldOff } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { BootScreen, StatusScreen } from "@/components/account/boot-screen";
import { apiCall, ApiError } from "@/lib/platform/client";
import { can, type Actor } from "@/lib/platform/roles";
import { AdminContext, type AdminContextValue } from "./admin-context";
import { AdminShell } from "./admin-shell";

type Gate =
  | { state: "checking" }
  | { state: "ready"; actor: Actor }
  | { state: "denied" }
  | { state: "error"; message: string; status: number };

const linkClass =
  "inline-flex h-11 items-center justify-center rounded-full bg-accent px-5 text-sm font-semibold text-accent-fg shadow-accent transition-all hover:brightness-[1.06]";

/**
 * The Admin Center's front door. Nothing renders until the server has
 * verified the session and confirmed a role (GET /api/admin/me). Every page
 * inside still gets its data from routes that check again, so this is about
 * what to show, not what anyone may do.
 */
export function AdminRoot({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [gate, setGate] = useState<Gate>({ state: "checking" });
  const userId = auth.status === "signedIn" ? auth.user?.id : null;

  useEffect(() => {
    if (!auth.cloudEnabled) return;
    if (auth.status === "signedOut") {
      router.replace(`/login?next=${encodeURIComponent(pathname || "/admin")}`);
      return;
    }
    if (!userId) return;
    let live = true;
    setGate({ state: "checking" });
    apiCall<Actor>("/api/admin/me")
      .then((actor) => live && setGate({ state: "ready", actor }))
      .catch((e: unknown) => {
        if (!live) return;
        if (e instanceof ApiError && e.status === 401) {
          router.replace(`/login?ended=1&next=${encodeURIComponent(pathname || "/admin")}`);
        } else if (e instanceof ApiError && e.status === 403) {
          setGate({ state: "denied" });
        } else {
          setGate({ state: "error", message: e instanceof Error ? e.message : "Something went wrong.", status: e instanceof ApiError ? e.status : 0 });
        }
      });
    return () => {
      live = false;
    };
    // The role is checked once per account; each page's data is checked on every call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.cloudEnabled, auth.status, userId]);

  if (!auth.cloudEnabled) {
    return (
      <StatusScreen icon={CloudOff} title="The Admin Center needs accounts" body="This copy of DoOrDie runs without Supabase, so there are no accounts or roles to manage.">
        <Link href="/dashboard" className={linkClass}>
          Back to DoOrDie
        </Link>
      </StatusScreen>
    );
  }
  if (gate.state === "denied") {
    return (
      <StatusScreen icon={ShieldOff} title="No access" body="This account doesn't have an Admin Center role. If you think it should, ask the platform's owner.">
        <Link href="/dashboard" className={linkClass}>
          Back to DoOrDie
        </Link>
      </StatusScreen>
    );
  }
  if (gate.state === "error") {
    return (
      <StatusScreen icon={CloudOff} title={gate.status === 503 ? "Not set up yet" : "Couldn't open the Admin Center"} body={gate.message}>
        <button type="button" onClick={() => window.location.reload()} className={linkClass}>
          Try again
        </button>
      </StatusScreen>
    );
  }
  if (gate.state !== "ready") return <BootScreen label="Checking your access…" />;

  const value: AdminContextValue = { actor: gate.actor, can: (p) => can(gate.actor, p) };
  return (
    <AdminContext.Provider value={value}>
      <AdminShell>{children}</AdminShell>
    </AdminContext.Provider>
  );
}
