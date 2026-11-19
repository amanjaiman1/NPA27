"use client";

import { createContext, useContext } from "react";
import type { Actor, Permission } from "@/lib/platform/roles";

export interface AdminContextValue {
  actor: Actor;
  can: (permission: Permission) => boolean;
  /** Ends the session on this device and goes to the sign-in screen. */
  signOut: () => void;
}

export const AdminContext = createContext<AdminContextValue | null>(null);

/** The administrator the server confirmed, and what their role allows. */
export function useAdminActor(): AdminContextValue {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdminActor must be used inside the Admin Center");
  return ctx;
}
