"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMounted } from "@/lib/hooks";

/* ════════════════════════════════════════════════════════════════
   TOASTS
   A short note that something worked ("Habit created"), didn't ("Couldn't
   save: the date is in the future"), or can be taken back ("Entry
   deleted · Undo"). It appears at the bottom of the screen, above the
   phone's dock, waits while the pointer or focus is on it, and goes by
   itself. Screen readers hear it once, politely (errors at once).

   One provider for the app, mounted beside the confirmation dialog:

     const toast = useToast();
     toast({ title: "Saved", tone: "success" });
   ════════════════════════════════════════════════════════════════ */

export type ToastTone = "success" | "info" | "error";

export interface ToastOptions {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** A way to take it back or follow up: "Undo", "Open". */
  action?: { label: string; onClick: () => void };
  /** Milliseconds on screen. Errors stay longer. */
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
}

type ToastFn = (options: ToastOptions) => void;

const ToastContext = createContext<ToastFn | null>(null);

const MAX_VISIBLE = 3;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);
  const mounted = useMounted();

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), []);

  const toast = useCallback<ToastFn>((options) => {
    const id = next.current++;
    setItems((list) => [...list.filter((t) => t.title !== options.title), { ...options, id }].slice(-MAX_VISIBLE));
  }, []);

  const value = useMemo(() => toast, [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted &&
        createPortal(
          <MotionConfig reducedMotion="user">
            <div
              aria-live="polite"
              className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--bottom-nav-h,0px)+0.75rem)] z-[75] flex flex-col items-center gap-2 px-3 sm:inset-x-auto sm:right-5 sm:items-end lg:bottom-5"
            >
              <AnimatePresence initial={false}>
                {items.map((t) => (
                  <ToastCard key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
                ))}
              </AnimatePresence>
            </div>
          </MotionConfig>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const tone = item.tone ?? "success";
  const duration = item.duration ?? (tone === "error" ? 7000 : 4500);
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (held) return;
    const id = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(id);
  }, [held, duration, onDismiss]);

  return (
    <motion.div
      role={tone === "error" ? "alert" : "status"}
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.16 } }}
      transition={{ type: "spring", stiffness: 420, damping: 32 }}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
      className="glass-overlay pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-line px-3.5 py-3 shadow-lift"
    >
      <span
        className={cn(
          "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full",
          tone === "success" && "bg-positive/15 text-positive",
          tone === "info" && "bg-accent/15 text-accent",
          tone === "error" && "bg-danger/15 text-danger",
        )}
        aria-hidden
      >
        {tone === "success" ? (
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
            <motion.path
              d="M5 12.5l4.5 4.5L19 7.5"
              stroke="currentColor"
              strokeWidth={2.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: 0.08, duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            />
          </svg>
        ) : tone === "error" ? (
          <AlertTriangle className="h-4 w-4" />
        ) : (
          <Info className="h-4 w-4" />
        )}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-[0.86rem] font-semibold leading-snug text-paper">{item.title}</p>
        {item.description && <p className="mt-0.5 text-[0.78rem] leading-relaxed text-paper/65">{item.description}</p>}
      </div>
      {item.action && (
        <button
          type="button"
          onClick={() => {
            item.action?.onClick();
            onDismiss();
          }}
          className="mt-0.5 shrink-0 rounded-full bg-accent/10 px-3 py-1 text-[0.76rem] font-semibold text-accent transition-colors hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45"
        >
          {item.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss this message"
        className="-mr-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-transparent text-paper/50 transition-colors hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </motion.div>
  );
}

/** Shows a toast. Must be used within a ToastProvider. */
export function useToast(): ToastFn {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a <ToastProvider>");
  return ctx;
}
