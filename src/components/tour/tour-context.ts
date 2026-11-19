"use client";

import { createContext, useContext } from "react";

/* ════════════════════════════════════════════════════════════════
   THE FEATURE TOUR — the handle on it
   What a page needs to open the tour, kept apart from the provider so
   that importing it brings nothing else with it: no animation library,
   no loader. The provider (tour-provider.tsx) fills it in.
   ════════════════════════════════════════════════════════════════ */

export interface TourContextValue {
  /** Opens the tour from the start. */
  open: () => void;
  /** Starts downloading the tour, so opening it is instant. */
  prepare: () => void;
  isOpen: boolean;
  /** Never seen on this account: the button carries a dot. */
  fresh: boolean;
  /** The tour has just been closed for the first time: the button says where it lives. */
  hint: boolean;
  dismissHint: () => void;
}

export const TourContext = createContext<TourContextValue | null>(null);

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used within a TourProvider");
  return ctx;
}
