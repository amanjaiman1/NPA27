"use client";

import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { useChronicle, useHasHydrated } from "@/lib/store";
import { useAccount } from "@/components/account/account-session";
import { beginRouteTransition } from "@/components/layout/route-transition";
import { shouldAutoOpenTour } from "@/lib/tour";
import { toISODate } from "@/lib/utils";
import { TourContext, type TourContextValue } from "./tour-context";

/* ════════════════════════════════════════════════════════════════
   THE FEATURE TOUR — the part that is always loaded
   Decides when the tour opens, and remembers that it was seen. The tour
   itself (feature-tour.tsx and everything it draws) is downloaded only
   when it is about to open, so it costs the app nothing on any other
   visit: the button warms it up when it is pointed at or focused. It is
   loaded with React's own `lazy` rather than `next/dynamic`, whose loader
   would otherwise be added to every page of the app.
   ════════════════════════════════════════════════════════════════ */

const loadTour = () => import("./feature-tour");
const FeatureTour = lazy(loadTour);

/** How long the dashboard is on screen before the tour rises over it. */
const AUTO_OPEN_DELAY_MS = 900;
/** How long "take the tour again from here" stays beside the button. */
const HINT_MS = 6500;

export function TourProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const hydrated = useHasHydrated();
  const { mode, sync } = useAccount();
  const onboardedAt = useChronicle((s) => s.profile.onboardedAt);
  const tourSeenAt = useChronicle((s) => s.profile.tourSeenAt);
  const updateProfile = useChronicle((s) => s.updateProfile);

  const [isOpen, setOpen] = useState(false);
  const [hint, setHint] = useState(false);
  const openedOn = useRef<string | null>(null);
  const autoOpened = useRef(false);

  /**
   * Settled once a sync has finished this visit, or once it is clear none can.
   * Finishing the tour on another device arrives with that first sync, and
   * opening it before then would show it a second time.
   */
  const synced =
    mode === "local" ||
    sync.lastSyncedAt !== null ||
    sync.status === "offline" ||
    sync.status === "error";

  const eligible =
    hydrated &&
    synced &&
    !isOpen &&
    !autoOpened.current &&
    pathname === "/dashboard" &&
    shouldAutoOpenTour({ onboardedAt, tourSeenAt });

  // A new account's first visit to the dashboard: the page appears first, then
  // the tour rises over it. Leaving within that moment calls it off.
  useEffect(() => {
    if (!eligible) return;
    void loadTour();
    const id = window.setTimeout(() => {
      autoOpened.current = true;
      openedOn.current = "/dashboard";
      setOpen(true);
    }, AUTO_OPEN_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [eligible]);

  const open = useCallback(() => {
    setHint(false);
    openedOn.current = pathname;
    setOpen(true);
  }, [pathname]);

  const prepare = useCallback(() => {
    void loadTour();
  }, []);

  /**
   * Closing in any way counts as seen: finishing, skipping, or choosing where
   * to start. The first time it closes on the page it opened over, the button
   * points itself out, so it can be found again.
   */
  const close = useCallback(
    (destination?: string) => {
      setOpen(false);
      const first = !useChronicle.getState().profile.tourSeenAt;
      if (first) updateProfile({ tourSeenAt: toISODate(new Date()) });
      if (destination) {
        // The progress bar ends when the address changes; a link to the page
        // already open (or a section of it) never changes it.
        const url = new URL(destination, window.location.href);
        if (url.pathname !== window.location.pathname || url.search !== window.location.search) beginRouteTransition();
        router.push(destination);
      } else if (first) {
        setHint(true);
      }
    },
    [router, updateProfile],
  );

  // Another page while it is open (the back button, say): it goes with it.
  useEffect(() => {
    if (isOpen && openedOn.current && pathname !== openedOn.current) close();
  }, [isOpen, pathname, close]);

  useEffect(() => {
    if (!hint) return;
    const id = window.setTimeout(() => setHint(false), HINT_MS);
    return () => window.clearTimeout(id);
  }, [hint]);

  const dismissHint = useCallback(() => setHint(false), []);

  const value = useMemo<TourContextValue>(
    () => ({ open, prepare, isOpen, fresh: hydrated && !tourSeenAt, hint, dismissHint }),
    [open, prepare, isOpen, hydrated, tourSeenAt, hint, dismissHint],
  );

  return (
    <TourContext.Provider value={value}>
      {children}
      <AnimatePresence>
        {isOpen && (
          <Suspense key="tour" fallback={null}>
            <FeatureTour onClose={close} />
          </Suspense>
        )}
      </AnimatePresence>
    </TourContext.Provider>
  );
}
