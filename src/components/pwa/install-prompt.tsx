"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  X,
  Download,
  Share,
  Plus,
  Check,
  Smartphone,
  ChevronRight,
} from "lucide-react";
import { useInstall } from "@/lib/pwa";
import { Logo } from "@/components/layout/logo";

/**
 * A single, quiet invitation to install the Chronicle as an app.
 *
 * Chromium/Edge/Android get the native prompt; iOS Safari has no such API, so
 * it gets the two-step Share-sheet recipe instead. Dismissing hides it for a
 * fortnight, and it never appears once the app is installed.
 */
export function InstallPrompt() {
  const { bannerVisible, canInstall, needsIosInstructions, promptInstall, dismissBanner } =
    useInstall();

  return (
    <AnimatePresence>
      {bannerVisible && (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.98 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-x-3 bottom-3 z-[60] sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[22rem]"
          role="dialog"
          aria-label="Install The UPSC Chronicle"
        >
          <div className="relative overflow-hidden rounded-2xl border border-line bg-card/95 p-4 shadow-lift backdrop-blur-xl">
            {/* accent bloom in the corner */}
            <div className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-accent/25 blur-3xl" />

            <button
              onClick={dismissBanner}
              aria-label="Dismiss install prompt"
              className="absolute right-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-lg text-paper/40 transition-colors hover:bg-paper/[0.08] hover:text-paper"
            >
              <X className="h-3.5 w-3.5" />
            </button>

            <div className="relative flex items-start gap-3 pr-6">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-line bg-paper/[0.04]">
                <Logo className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <p className="font-display text-[0.95rem] font-medium tracking-tight text-paper">
                  Install the Chronicle
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-paper/50">
                  Keep it one tap away on your home screen — full screen, no
                  browser bars, and it works offline.
                </p>
              </div>
            </div>

            {needsIosInstructions && !canInstall ? (
              <ol className="relative mt-3.5 space-y-1.5 rounded-xl border border-line bg-paper/[0.03] p-3 text-xs text-paper/65">
                <li className="flex items-center gap-2">
                  <span className="tabular text-paper/35">1.</span>
                  <Share className="h-3.5 w-3.5 shrink-0 text-accent" />
                  <span>
                    Tap <span className="font-medium text-paper">Share</span> in
                    Safari
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="tabular text-paper/35">2.</span>
                  <Plus className="h-3.5 w-3.5 shrink-0 text-accent" />
                  <span>
                    Choose{" "}
                    <span className="font-medium text-paper">
                      Add to Home Screen
                    </span>
                  </span>
                </li>
              </ol>
            ) : (
              <div className="relative mt-3.5 flex items-center gap-2">
                <button
                  onClick={() => void promptInstall()}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg shadow-soft transition-all hover:-translate-y-px hover:opacity-90"
                >
                  <Download className="h-4 w-4" />
                  Install app
                </button>
                <button
                  onClick={dismissBanner}
                  className="rounded-xl border border-line bg-paper/[0.03] px-3.5 py-2.5 text-sm text-paper/60 transition-colors hover:border-paper/25 hover:text-paper"
                >
                  Not now
                </button>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * The same capability, surfaced permanently in Settings so the app can be
 * installed at any time — including after the banner has been dismissed.
 */
export function InstallCard() {
  const { canInstall, installed, needsIosInstructions, promptInstall } = useInstall();

  return (
    <div>
      <p className="eyebrow mb-1">Install as an app</p>
      <p className="mb-3 text-xs leading-relaxed text-paper/45">
        Add the Chronicle to your home screen or desktop for a full-screen,
        offline-capable app — your data stays on the device and syncs when
        you&apos;re back online.
      </p>

      {installed ? (
        <p className="flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2.5 text-xs text-paper/80">
          <Check className="h-3.5 w-3.5 shrink-0 text-accent" />
          Installed — you&apos;re running the Chronicle as an app.
        </p>
      ) : canInstall ? (
        <button
          onClick={() => void promptInstall()}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg shadow-soft transition-all hover:opacity-90"
        >
          <Download className="h-4 w-4" />
          Install the Chronicle
        </button>
      ) : needsIosInstructions ? (
        <p className="flex items-start gap-2 rounded-xl border border-line bg-paper/[0.03] px-3 py-2.5 text-xs leading-relaxed text-paper/65">
          <Share className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
          <span>
            In Safari, tap <span className="font-medium text-paper">Share</span>{" "}
            <ChevronRight className="inline h-3 w-3 align-[-2px]" />{" "}
            <span className="font-medium text-paper">Add to Home Screen</span>.
          </span>
        </p>
      ) : (
        <p className="flex items-start gap-2 rounded-xl border border-line bg-paper/[0.03] px-3 py-2.5 text-xs leading-relaxed text-paper/55">
          <Smartphone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-paper/40" />
          <span>
            Use your browser&apos;s <span className="font-medium text-paper">Install</span>{" "}
            option (address bar or menu). Chrome, Edge, Safari and Android
            browsers are supported.
          </span>
        </p>
      )}
    </div>
  );
}
