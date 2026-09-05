"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { CommandPalette } from "./command-palette";
import { AppearanceModal } from "./appearance";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const pathname = usePathname();

  // restore collapse preference
  useEffect(() => {
    const v = localStorage.getItem("upsc-chronicle-sidebar");
    if (v === "1") setCollapsed(true);
  }, []);

  function toggleCollapse() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem("upsc-chronicle-sidebar", next ? "1" : "0");
      return next;
    });
  }

  // ⌘K / Ctrl+K to open the palette
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

  // close mobile drawer on route change
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  return (
    <div className="relative flex h-[100dvh] overflow-hidden">
      {/* Ambient canvas — two wide, very soft accent washes. Deliberately
          restrained: the content and its white cards are the design. */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-bloom-field" />
        <div className="absolute -left-40 -top-40 h-[30rem] w-[30rem] animate-bloom-float rounded-full bg-accent/[0.07] blur-[120px]" />
        <div className="absolute -right-32 top-1/3 h-[26rem] w-[26rem] animate-bloom-float-2 rounded-full bg-bloom-3/[0.06] blur-[120px]" />
      </div>

      {/* Desktop sidebar */}
      <div className="z-20 hidden shrink-0 lg:block">
        <Sidebar
          collapsed={collapsed}
          onToggleCollapse={toggleCollapse}
          onOpenPalette={() => setPaletteOpen(true)}
          onOpenAppearance={() => setAppearanceOpen(true)}
        />
      </div>

      {/* Mobile drawer */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-scrim/45 backdrop-blur-md lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)}
            />
            <motion.div
              className="fixed inset-y-0 left-0 z-50 lg:hidden"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
            >
              <Sidebar
                collapsed={false}
                onToggleCollapse={toggleCollapse}
                onNavigate={() => setDrawerOpen(false)}
                onOpenPalette={() => {
                  setDrawerOpen(false);
                  setPaletteOpen(true);
                }}
                onOpenAppearance={() => {
                  setDrawerOpen(false);
                  setAppearanceOpen(true);
                }}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          onOpenDrawer={() => setDrawerOpen(true)}
          onOpenPalette={() => setPaletteOpen(true)}
          onOpenAppearance={() => setAppearanceOpen(true)}
        />
        <main className="no-scrollbar relative flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1240px] px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
            {children}
          </div>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <AppearanceModal
        open={appearanceOpen}
        onClose={() => setAppearanceOpen(false)}
      />
    </div>
  );
}
