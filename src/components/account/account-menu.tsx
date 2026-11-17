"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { LogOut, Settings, UserRound } from "lucide-react";
import { useChronicle } from "@/lib/store";
import { useMounted } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { useAccount } from "./account-session";
import { describeSync, initialsOf } from "./sync-label";

const TONE_DOT = {
  ok: "bg-positive",
  busy: "bg-warning",
  muted: "bg-paper/40",
  warn: "bg-danger",
} as const;

/** The avatar in the top bar: who is signed in, whether it's synced, and the way out. */
export function AccountMenu() {
  const [open, setOpen] = useState(false);
  const mounted = useMounted();
  const { user, mode, sync } = useAccount();
  const profileName = useChronicle((s) => s.profile.name);
  const name = profileName || user?.name || "Your account";
  const status = describeSync(sync, mode);

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`Account: ${name}. ${status.label}.`}
        aria-expanded={open}
        title={`${name} · ${status.label}`}
        className="relative grid h-10 w-10 place-items-center rounded-full transition-all hover:bg-paper/[0.07]"
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-accent text-[0.68rem] font-bold text-accent-fg shadow-accent">
          {initialsOf(name)}
        </span>
        <span
          className={cn(
            "absolute bottom-1.5 right-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-card",
            TONE_DOT[status.tone],
          )}
        />
      </button>
      {mounted &&
        createPortal(
          <AnimatePresence>{open && <Panel onClose={() => setOpen(false)} name={name} />}</AnimatePresence>,
          document.body,
        )}
    </>
  );
}

function Panel({ onClose, name }: { onClose: () => void; name: string }) {
  const { user, mode, sync, syncNow, signOut } = useAccount();
  const status = describeSync(sync, mode);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <>
      <motion.div
        className="fixed inset-0 z-[55] bg-scrim/40 backdrop-blur-sm sm:bg-transparent sm:backdrop-blur-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={onClose}
      />
      <motion.div
        role="dialog"
        aria-label="Account"
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 6, scale: 0.98 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="fixed inset-x-2 bottom-2 z-[56] overflow-hidden rounded-3xl border border-line bg-card shadow-lift sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-[4.6rem] sm:w-[21rem]"
      >
        <div className="flex items-center gap-3 border-b border-line px-4 py-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-sm font-bold text-accent-fg shadow-accent">
            {initialsOf(name)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-paper">{name}</p>
            <p className="truncate text-xs text-paper/50">
              {mode === "cloud" ? user?.email : "Saved on this device"}
            </p>
          </div>
        </div>

        <div className="px-4 py-3.5">
          <div className="flex items-start gap-2.5 rounded-2xl bg-paper/[0.04] px-3.5 py-3">
            <status.icon
              className={cn(
                "mt-0.5 h-4 w-4 shrink-0",
                status.tone === "warn" ? "text-danger" : "text-accent",
                status.spin && "animate-spin",
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-paper">{status.label}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-paper/55">{status.detail}</p>
            </div>
            {mode === "cloud" && (status.tone === "warn" || status.tone === "muted") && (
              <button onClick={syncNow} className="shrink-0 text-xs font-semibold text-accent hover:underline">
                Retry
              </button>
            )}
          </div>
        </div>

        <nav className="border-t border-line p-2">
          <Link
            href="/settings#profile"
            onClick={onClose}
            className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm text-paper/75 transition-colors hover:bg-paper/[0.05] hover:text-paper"
          >
            <UserRound className="h-4 w-4 text-paper/45" /> Profile &amp; exam
          </Link>
          <Link
            href="/settings"
            onClick={onClose}
            className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm text-paper/75 transition-colors hover:bg-paper/[0.05] hover:text-paper"
          >
            <Settings className="h-4 w-4 text-paper/45" /> Settings
          </Link>
          {mode === "cloud" && (
            <button
              onClick={() => {
                // Close first: signing out may need to ask about unsynced changes.
                onClose();
                void signOut();
              }}
              className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm text-paper/75 transition-colors hover:bg-paper/[0.05] hover:text-paper"
            >
              <LogOut className="h-4 w-4 text-paper/45" /> Sign out
            </button>
          )}
        </nav>
      </motion.div>
    </>
  );
}
