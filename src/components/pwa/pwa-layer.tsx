"use client";

import { AnimatePresence, motion } from "framer-motion";
import { RefreshCw, WifiOff } from "lucide-react";
import { useServiceWorker } from "@/lib/pwa";
import { InstallPrompt } from "./install-prompt";
import { ThemeColorSync } from "./theme-color-sync";

/**
 * Everything the installed app needs on top of the normal page tree:
 *   • the service worker registration,
 *   • a nudge when a newer build is waiting, and
 *   • an offline indicator (the app keeps working — data lives locally).
 *
 * Rendered once, from the root layout, outside the auth gate so it is present
 * on the sign-in screen too.
 */
export function PwaLayer() {
  const { updateReady, applyUpdate, offline } = useServiceWorker();

  return (
    <>
      <ThemeColorSync />
      <InstallPrompt />

      <AnimatePresence>
        {offline && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.22 }}
            className="pointer-events-none fixed left-1/2 top-3 z-[70] -translate-x-1/2"
          >
            <span className="flex items-center gap-2 rounded-full border border-line bg-card/95 px-3.5 py-1.5 text-xs text-paper/70 shadow-soft backdrop-blur-xl">
              <WifiOff className="h-3.5 w-3.5 text-paper/45" />
              Offline — saved on this device
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {updateReady && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            className="fixed bottom-3 left-1/2 z-[65] -translate-x-1/2"
            role="status"
          >
            <div className="flex items-center gap-3 rounded-full border border-line bg-card/95 py-1.5 pl-4 pr-1.5 shadow-lift backdrop-blur-xl">
              <span className="text-xs text-paper/70">
                A new version is ready
              </span>
              <button
                onClick={applyUpdate}
                className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg transition-opacity hover:opacity-90"
              >
                <RefreshCw className="h-3 w-3" />
                Reload
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
