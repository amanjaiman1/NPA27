"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { Sidebar } from "./sidebar";
import { NavRail } from "./nav-rail";
import { RouteTransition } from "./route-transition";
import { PageTransition } from "./page-transition";
import { Topbar } from "./topbar";
import { CommandPalette } from "./command-palette";
import { AppearanceModal } from "./appearance";
import { BottomNav } from "./bottom-nav";
import { FileJanitor } from "@/components/attachments/file-janitor";
import { useMatchMedia } from "@/lib/hooks";

/** "1" when the person hid the sidebar on a wide screen. Same key as before. */
const SIDEBAR_KEY = "upsc-chronicle-sidebar";
const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * The app's frame, in three zones on a desktop:
 *
 *   rail     the brand, the account, everyday shortcuts and utilities
 *   sidebar  the full navigation; docked beside the rail from 1280px, opened
 *            from the rail over the page below that, so two columns of
 *            navigation never crowd a smaller screen
 *   page     a floating search bar above the stage the page sits in
 *
 * On a phone: a top bar, the page edge to edge, a floating dock for the four
 * everyday sections, and the sidebar as a drawer behind "More" or the menu.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const desktop = useMatchMedia("(min-width: 1024px)");
  const wide = useMatchMedia("(min-width: 1280px)");
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== "undefined" && window.localStorage.getItem(SIDEBAR_KEY) === "1",
  );
  const [flyoutOpen, setFlyoutOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const pathname = usePathname();

  const docked = desktop && wide && !collapsed;
  const sidebarShowing = docked || (desktop && !wide && flyoutOpen);

  const setCollapsedPref = useCallback((next: boolean) => {
    setCollapsed(next);
    try {
      window.localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
    } catch {
      // Storage is blocked; the choice lasts for this visit.
    }
  }, []);

  function toggleSidebar() {
    if (wide) setCollapsedPref(!collapsed);
    else setFlyoutOpen((o) => !o);
  }

  // ⌘K / Ctrl+K opens the palette.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Moving to another page closes anything opened over it.
  useEffect(() => {
    setDrawerOpen(false);
    setFlyoutOpen(false);
  }, [pathname]);

  // A flyout or drawer closes with Escape, and goes when the layout changes.
  useEffect(() => {
    if (!flyoutOpen && !drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setFlyoutOpen(false);
        setDrawerOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flyoutOpen, drawerOpen]);
  useEffect(() => {
    if (wide) setFlyoutOpen(false);
    if (desktop) setDrawerOpen(false);
  }, [wide, desktop]);

  const openPalette = () => {
    setDrawerOpen(false);
    setFlyoutOpen(false);
    setPaletteOpen(true);
  };
  const openAppearance = () => {
    setDrawerOpen(false);
    setFlyoutOpen(false);
    setAppearanceOpen(true);
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="app-root relative flex h-[100dvh] overflow-hidden">
        {/* The page-to-page wait. Driven from the tap rather than from the
            router; see `route-transition.tsx`. In Suspense because it reads
            the search params. */}
        <Suspense fallback={null}>
          <RouteTransition />
        </Suspense>

        {/* The environment: each theme's layered backdrop, painted once. */}
        <div aria-hidden className="app-backdrop pointer-events-none fixed inset-0 -z-10" />

        {/* Desktop: the rail, and the sidebar docked beside it. */}
        {desktop && (
          <div className="flex shrink-0 py-3 pl-3">
            <NavRail
              sidebarOpen={sidebarShowing}
              onToggleSidebar={toggleSidebar}
              onOpenPalette={openPalette}
              onOpenAppearance={openAppearance}
            />
            <AnimatePresence initial={false}>
              {docked && (
                <motion.div
                  key="docked-sidebar"
                  className="h-full shrink-0 [overflow-clip-margin:2.5rem] [overflow:clip]"
                  initial={{ width: 0, marginLeft: 0, opacity: 0 }}
                  animate={{ width: "16rem", marginLeft: "0.75rem", opacity: 1 }}
                  exit={{ width: 0, marginLeft: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: EASE }}
                >
                  <Sidebar
                    variant="docked"
                    onCollapse={() => setCollapsedPref(true)}
                    onOpenPalette={openPalette}
                    onOpenAppearance={openAppearance}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* A narrower desktop: the sidebar opens from the rail, over the page. */}
        <AnimatePresence>
          {desktop && !wide && flyoutOpen && (
            <>
              <motion.div
                key="flyout-scrim"
                className="fixed inset-0 z-40 bg-scrim/15"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                onClick={() => setFlyoutOpen(false)}
              />
              <motion.div
                key="flyout"
                className="fixed bottom-3 left-[6.25rem] top-3 z-50"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.22, ease: EASE }}
              >
                <Sidebar
                  variant="flyout"
                  onNavigate={() => setFlyoutOpen(false)}
                  onOpenPalette={openPalette}
                  onOpenAppearance={openAppearance}
                />
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* A phone: the sidebar as a drawer. */}
        <AnimatePresence>
          {!desktop && drawerOpen && (
            <>
              <motion.div
                key="drawer-scrim"
                className="fixed inset-0 z-40 bg-scrim/50 backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setDrawerOpen(false)}
              />
              <motion.div
                key="drawer"
                className="fixed inset-y-0 left-0 z-50"
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "spring", damping: 32, stiffness: 320 }}
              >
                <Sidebar
                  variant="drawer"
                  onNavigate={() => setDrawerOpen(false)}
                  onOpenPalette={openPalette}
                  onOpenAppearance={openAppearance}
                />
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* The page: the search bar, then the stage. */}
        <div className="flex min-w-0 flex-1 flex-col gap-3 lg:py-3 lg:pl-3 lg:pr-3">
          <Topbar desktop={desktop} onOpenDrawer={() => setDrawerOpen(true)} onOpenPalette={openPalette} />
          <main className="app-stage no-scrollbar relative min-h-0 flex-1 overflow-y-auto">
            {/* Bottom padding clears the phone's dock. */}
            <div className="mx-auto w-full max-w-[1480px] px-4 pb-[calc(var(--bottom-nav-h,0px)+1.5rem)] pt-3 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8 2xl:px-10">
              <PageTransition>{children}</PageTransition>
            </div>
          </main>
        </div>

        <BottomNav onOpenMenu={() => setDrawerOpen(true)} />
        <FileJanitor />

        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
        <AppearanceModal open={appearanceOpen} onClose={() => setAppearanceOpen(false)} />
      </div>
    </MotionConfig>
  );
}
